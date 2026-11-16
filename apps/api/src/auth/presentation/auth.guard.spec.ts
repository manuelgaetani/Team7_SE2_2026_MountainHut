import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { AuthGuard } from './auth.guard.js';

const SECRET = 'unit-test-secret';
const payload = { sub: 7, email: 'anna@example.it', role: 'EMPLOYEE' };

type FakeRequest = { cookies?: Record<string, string>; user?: unknown };

const contextFor = (req: FakeRequest): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

const base64url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('AuthGuard', () => {
  const jwt = new JwtService({ secret: SECRET });
  const guard = new AuthGuard(jwt);

  it('lets a request with a valid access token through and exposes the user', async () => {
    const req: FakeRequest = { cookies: { token: await jwt.signAsync(payload) } };
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.user).toEqual({ id: 7, email: 'anna@example.it', role: 'EMPLOYEE' });
  });

  it('rejects a request without cookies', async () => {
    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a request without the access token cookie', async () => {
    const req: FakeRequest = { cookies: { refresh_token: 'something' } };
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a malformed token', async () => {
    const req: FakeRequest = { cookies: { token: 'not-a-jwt' } };
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'another-secret' }).signAsync(payload);
    const req: FakeRequest = { cookies: { token: forged } };
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const expired = await jwt.signAsync({ ...payload, exp: Math.floor(Date.now() / 1000) - 10 });
    const req: FakeRequest = { cookies: { token: expired } };
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token whose payload was changed after signing', async () => {
    const [header, , signature] = (await jwt.signAsync(payload)).split('.');
    const tampered = `${header}.${base64url({ ...payload, role: 'WARDEN' })}.${signature}`;
    const req: FakeRequest = { cookies: { token: tampered } };
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unsigned token (alg "none")', async () => {
    const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(payload)}.`;
    const req: FakeRequest = { cookies: { token: unsigned } };
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed with an algorithm other than HS256', async () => {
    const hs512 = await jwt.signAsync(payload, { algorithm: 'HS512' });
    const req: FakeRequest = { cookies: { token: hs512 } };
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not set the user when the token is rejected', async () => {
    const req: FakeRequest = { cookies: { token: 'not-a-jwt' } };
    await expect(guard.canActivate(contextFor(req))).rejects.toThrow();
    expect(req.user).toBeUndefined();
  });
});
