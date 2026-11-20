import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefreshTokenGenerator, RefreshTokenRepository } from './ports.js';
import { RefreshSession } from './refresh-session.js';
import type { AuthSession, SessionIssuer } from './session-issuer.js';

const user = { id: 1, email: 'a@b.it', role: 'HIKER' as const, mustChangePassword: false };
const session: AuthSession = {
  token: 'nuovo-access',
  refreshToken: 'nuovo-refresh',
  refreshExpiresAt: new Date('2026-11-01T10:00:00Z'),
  user,
};

describe('RefreshSession', () => {
  const tokens = {
    create: vi.fn(),
    findByHash: vi.fn(),
    revokeIfActive: vi.fn(),
    revokeAllForUser: vi.fn(),
    revokeByHash: vi.fn(),
  };
  const generator = { generate: vi.fn(), hash: vi.fn() };
  const sessions = { issue: vi.fn() };
  let refresh: RefreshSession;

  const valid = () => ({
    id: 5,
    userId: 1,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    generator.hash.mockImplementation((raw: string) => `hash(${raw})`);
    refresh = new RefreshSession(
      tokens as unknown as RefreshTokenRepository,
      generator as unknown as RefreshTokenGenerator,
      sessions as unknown as SessionIssuer,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lancia Unauthorized se il token non esiste', async () => {
    tokens.findByHash.mockResolvedValue(null);
    await expect(refresh.execute('sconosciuto')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid session',
    });
  });

  it('looks the token up by its hash', async () => {
    tokens.findByHash.mockResolvedValue(null);
    await expect(refresh.execute('raw-token')).rejects.toMatchObject({
      message: 'Invalid session',
    });
    expect(tokens.findByHash).toHaveBeenCalledWith('hash(raw-token)');
  });

  it('lancia Unauthorized se il token è scaduto', async () => {
    tokens.findByHash.mockResolvedValue({ ...valid(), expiresAt: new Date(Date.now() - 1000) });
    await expect(refresh.execute('scaduto')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Session expired',
    });
  });

  it('rejects a token that expires exactly now', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date('2026-10-28T12:00:00Z');
    vi.setSystemTime(now);
    tokens.findByHash.mockResolvedValue({ ...valid(), expiresAt: now });
    await expect(refresh.execute('al-limite')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Session expired',
    });
    expect(tokens.revokeIfActive).not.toHaveBeenCalled();
  });

  it('token già revocato: revoca tutte le sessioni dell’utente e lancia Unauthorized', async () => {
    tokens.findByHash.mockResolvedValue({ ...valid(), revokedAt: new Date() });
    await expect(refresh.execute('riusato')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid session',
    });
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith(1);
  });

  it('issues no new session when a revoked token is reused', async () => {
    tokens.findByHash.mockResolvedValue({ ...valid(), revokedAt: new Date() });
    await expect(refresh.execute('riusato')).rejects.toMatchObject({
      message: 'Invalid session',
    });
    expect(tokens.revokeIfActive).not.toHaveBeenCalled();
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('lancia Unauthorized se un’altra richiesta ha già usato il token', async () => {
    tokens.findByHash.mockResolvedValue(valid());
    tokens.revokeIfActive.mockResolvedValue(false);
    await expect(refresh.execute('gara')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid session',
    });
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('token valido: revoca il vecchio ed emette una nuova coppia di token', async () => {
    tokens.findByHash.mockResolvedValue(valid());
    tokens.revokeIfActive.mockResolvedValue(true);
    sessions.issue.mockResolvedValue(session);
    await expect(refresh.execute('valido')).resolves.toBe(session);
    expect(tokens.revokeIfActive).toHaveBeenCalledWith(5);
    expect(sessions.issue).toHaveBeenCalledWith(user);
  });

  it('keeps the current role in the new session', async () => {
    tokens.findByHash.mockResolvedValue({ ...valid(), user: { ...user, role: 'EMPLOYEE' } });
    tokens.revokeIfActive.mockResolvedValue(true);
    sessions.issue.mockResolvedValue(session);
    await refresh.execute('valido');
    expect(sessions.issue).toHaveBeenCalledWith({
      id: 1,
      email: 'a@b.it',
      role: 'EMPLOYEE',
      mustChangePassword: false,
    });
  });

  // MH-07: refreshing the session does not end the forced change of the password.
  it('keeps the forced change of the password in the new session', async () => {
    tokens.findByHash.mockResolvedValue({
      ...valid(),
      user: { ...user, mustChangePassword: true },
    });
    tokens.revokeIfActive.mockResolvedValue(true);
    sessions.issue.mockResolvedValue(session);
    await refresh.execute('valido');
    expect(sessions.issue).toHaveBeenCalledWith(
      expect.objectContaining({ mustChangePassword: true }),
    );
  });
});
