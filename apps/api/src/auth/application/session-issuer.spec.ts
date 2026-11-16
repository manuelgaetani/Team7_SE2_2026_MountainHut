import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAppConfig } from '../../config/app-config.js';
import type { AccessTokenIssuer, RefreshTokenGenerator, RefreshTokenRepository } from './ports.js';
import { SessionIssuer } from './session-issuer.js';

const config = (env: Record<string, string | undefined> = {}) =>
  loadAppConfig({ JWT_SECRET: 'unit-test-secret', DATABASE_URL: 'postgresql://x', ...env });

const NOW = new Date('2026-10-28T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const user = { id: 1, email: 'a@b.it', role: 'HIKER' as const };

describe('SessionIssuer', () => {
  const tokens = { create: vi.fn() };
  const accessTokens = { sign: vi.fn() };
  const generator = { generate: vi.fn(), hash: vi.fn() };

  const issuerWith = (env: Record<string, string | undefined> = {}) =>
    new SessionIssuer(
      accessTokens as unknown as AccessTokenIssuer,
      generator as unknown as RefreshTokenGenerator,
      tokens as unknown as RefreshTokenRepository,
      config(env),
    );

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    accessTokens.sign.mockResolvedValue('token-finto');
    generator.generate.mockReturnValue({ raw: 'raw-refresh', hash: 'hashed-refresh' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restituisce access token, refresh token e utente', async () => {
    const session = await issuerWith().issue(user);
    expect(session).toEqual({
      token: 'token-finto',
      refreshToken: 'raw-refresh',
      refreshExpiresAt: new Date(NOW.getTime() + DAY_MS),
      user,
    });
  });

  it('signs the access token for the user', async () => {
    await issuerWith().issue(user);
    expect(accessTokens.sign).toHaveBeenCalledWith(user);
  });

  it('stores only the hash of the refresh token', async () => {
    const session = await issuerWith().issue(user);
    expect(tokens.create).toHaveBeenCalledWith(1, 'hashed-refresh', session.refreshExpiresAt);
  });

  it('lasts 1 day by default', async () => {
    const session = await issuerWith().issue(user);
    expect(session.refreshExpiresAt).toEqual(new Date(NOW.getTime() + DAY_MS));
  });

  it('follows REFRESH_TOKEN_TTL_DAYS', async () => {
    const session = await issuerWith({ REFRESH_TOKEN_TTL_DAYS: '7' }).issue(user);
    expect(session.refreshExpiresAt).toEqual(new Date(NOW.getTime() + 7 * DAY_MS));
    expect(tokens.create).toHaveBeenCalledWith(1, 'hashed-refresh', session.refreshExpiresAt);
  });

  describe('refresh token lifetime configuration', () => {
    it.each(['abc', '', '0', '-1', 'Infinity', '1e300'])(
      'refuses to start with REFRESH_TOKEN_TTL_DAYS="%s"',
      (days) => {
        expect(() => issuerWith({ REFRESH_TOKEN_TTL_DAYS: days })).toThrow(
          'REFRESH_TOKEN_TTL_DAYS',
        );
      },
    );

    it('accepts a fraction of a day', async () => {
      const session = await issuerWith({ REFRESH_TOKEN_TTL_DAYS: '0.5' }).issue(user);
      expect(session.refreshExpiresAt).toEqual(new Date(NOW.getTime() + DAY_MS / 2));
    });
  });
});
