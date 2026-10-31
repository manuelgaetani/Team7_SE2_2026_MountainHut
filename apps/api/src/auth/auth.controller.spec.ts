import { UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import type { AuthSession } from './auth.service.js';

const user = { id: 1, email: 'anna@example.it', role: 'HIKER' as const };
const session: AuthSession = {
  token: 'access-token',
  refreshToken: 'refresh-token',
  refreshExpiresAt: new Date('2026-11-01T10:00:00Z'),
  user,
};

const fakeResponse = () => ({ cookie: vi.fn(), clearCookie: vi.fn() });
const asResponse = (res: ReturnType<typeof fakeResponse>) => res as unknown as Response;
const requestWithCookies = (cookies?: Record<string, string>) => ({ cookies }) as Request;

describe('AuthController', () => {
  let controller: AuthController;
  const auth = {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AuthController);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('route protection', () => {
    const guardsOf = (handler: keyof AuthController) =>
      new Reflector().get<unknown[] | undefined>(
        GUARDS_METADATA,
        AuthController.prototype[handler],
      );

    it('protects GET /auth/me with AuthGuard', () => {
      expect(guardsOf('me')).toEqual([AuthGuard]);
    });

    it.each(['register', 'login', 'refresh', 'logout'] as const)(
      'leaves POST /auth/%s public',
      (handler) => {
        expect(guardsOf(handler)).toBeUndefined();
      },
    );
  });

  describe('register', () => {
    it('passes the body to the service and returns the created user', async () => {
      const body = {
        email: 'anna@example.it',
        password: 'password123',
        fullName: 'Anna Rossi',
        phone: '3331234567',
      };
      auth.register.mockResolvedValue(user);
      await expect(controller.register(body)).resolves.toEqual(user);
      expect(auth.register).toHaveBeenCalledWith(body);
    });
  });

  describe('login', () => {
    const body = { email: 'anna@example.it', password: 'password123' };

    it('sets the access and refresh cookies as httpOnly and sameSite=lax', async () => {
      auth.login.mockResolvedValue(session);
      const res = fakeResponse();
      await controller.login(body, asResponse(res));
      expect(auth.login).toHaveBeenCalledWith(body);
      expect(res.cookie).toHaveBeenCalledWith('token', 'access-token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
      });
      expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'refresh-token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/api/auth',
        expires: session.refreshExpiresAt,
      });
    });

    it('returns only the user, never the tokens', async () => {
      auth.login.mockResolvedValue(session);
      const result = await controller.login(body, asResponse(fakeResponse()));
      expect(result).toEqual(user);
      expect(JSON.stringify(result)).not.toContain('access-token');
      expect(JSON.stringify(result)).not.toContain('refresh-token');
    });

    it('marks both cookies as secure in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      auth.login.mockResolvedValue(session);
      const res = fakeResponse();
      await controller.login(body, asResponse(res));
      expect(res.cookie).toHaveBeenCalledTimes(2);
      for (const [, , options] of res.cookie.mock.calls) {
        expect(options).toMatchObject({ secure: true });
      }
    });

    it('sets no cookie when the credentials are rejected', async () => {
      auth.login.mockRejectedValue(new UnauthorizedException());
      const res = fakeResponse();
      await expect(controller.login(body, asResponse(res))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rejects a request without the refresh cookie', async () => {
      const res = fakeResponse();
      await expect(
        controller.refresh(requestWithCookies({}), asResponse(res)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auth.refresh).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('rejects a request where no cookies were parsed', async () => {
      await expect(
        controller.refresh(requestWithCookies(undefined), asResponse(fakeResponse())),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rotates the session using the refresh cookie and returns the user', async () => {
      auth.refresh.mockResolvedValue({
        ...session,
        token: 'new-access',
        refreshToken: 'new-refresh',
      });
      const res = fakeResponse();
      const result = await controller.refresh(
        requestWithCookies({ refresh_token: 'old-refresh' }),
        asResponse(res),
      );
      expect(auth.refresh).toHaveBeenCalledWith('old-refresh');
      expect(res.cookie).toHaveBeenCalledWith('token', 'new-access', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'new-refresh',
        expect.objectContaining({ path: '/api/auth' }),
      );
      expect(result).toEqual(user);
    });

    it('sets no cookie when the service rejects the refresh token', async () => {
      auth.refresh.mockRejectedValue(new UnauthorizedException());
      const res = fakeResponse();
      await expect(
        controller.refresh(requestWithCookies({ refresh_token: 'revoked' }), asResponse(res)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the refresh token and clears both cookies', async () => {
      const res = fakeResponse();
      const result = await controller.logout(
        requestWithCookies({ refresh_token: 'refresh-token' }),
        asResponse(res),
      );
      expect(auth.logout).toHaveBeenCalledWith('refresh-token');
      expect(res.clearCookie).toHaveBeenCalledWith('token');
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', { path: '/api/auth' });
      expect(result).toEqual({ message: 'Logged out' });
    });

    it('still clears the cookies when there is no refresh cookie', async () => {
      const res = fakeResponse();
      await controller.logout(requestWithCookies({}), asResponse(res));
      expect(auth.logout).toHaveBeenCalledWith(undefined);
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
    });
  });

  describe('me', () => {
    it('returns the profile of the user set by the guard', async () => {
      auth.me.mockResolvedValue(user);
      const req = { user: { id: 1 } } as Request & { user: { id: number } };
      await expect(controller.me(req)).resolves.toEqual(user);
      expect(auth.me).toHaveBeenCalledWith(1);
    });
  });
});
