import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from './login.js';
import type { PasswordHasher, UsersRepository } from './ports.js';
import type { AuthSession, SessionIssuer } from './session-issuer.js';

const record = {
  id: 1,
  email: 'a@b.it',
  role: 'HIKER' as const,
  passwordHash: 'stored-hash',
  mustChangePassword: false,
};
const session: AuthSession = {
  token: 'token-finto',
  refreshToken: 'refresh-finto',
  refreshExpiresAt: new Date('2026-11-01T10:00:00Z'),
  user: { id: 1, email: 'a@b.it', role: 'HIKER', mustChangePassword: false },
};

describe('Login', () => {
  const users = { findByEmail: vi.fn(), findById: vi.fn(), createWithHiker: vi.fn() };
  const hasher = { hash: vi.fn(), compare: vi.fn() };
  const sessions = { issue: vi.fn() };
  let login: Login;

  beforeEach(() => {
    vi.resetAllMocks();
    login = new Login(
      users as unknown as UsersRepository,
      hasher as unknown as PasswordHasher,
      sessions as unknown as SessionIssuer,
    );
  });

  it('lancia Unauthorized con password sbagliata', async () => {
    users.findByEmail.mockResolvedValue(record);
    hasher.compare.mockResolvedValue(false);
    await expect(login.execute({ email: 'a@b.it', password: 'sbagliata' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid credentials',
    });
    expect(hasher.compare).toHaveBeenCalledWith('sbagliata', 'stored-hash');
  });

  it('lancia Unauthorized se l’utente non esiste', async () => {
    users.findByEmail.mockResolvedValue(null);
    hasher.compare.mockResolvedValue(false);
    await expect(login.execute({ email: 'x@y.it', password: 'qualsiasi' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid credentials',
    });
  });

  it('still runs a password comparison when the email is unknown', async () => {
    users.findByEmail.mockResolvedValue(null);
    // Even a hasher that would accept must not let an unknown email in.
    hasher.compare.mockResolvedValue(true);
    await expect(login.execute({ email: 'x@y.it', password: 'qualsiasi' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Invalid credentials',
    });
    expect(hasher.compare).toHaveBeenCalledTimes(1);
    expect(hasher.compare).toHaveBeenCalledWith('qualsiasi', null);
  });

  it('issues no session when the credentials are rejected', async () => {
    users.findByEmail.mockResolvedValue(record);
    hasher.compare.mockResolvedValue(false);
    await expect(login.execute({ email: 'a@b.it', password: 'sbagliata' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('looks the account up by email', async () => {
    users.findByEmail.mockResolvedValue(null);
    await login.execute({ email: 'a@b.it', password: 'giusta123' }).catch(() => undefined);
    expect(users.findByEmail).toHaveBeenCalledWith('a@b.it');
  });

  it('returns the session issued for the user, without the password hash', async () => {
    users.findByEmail.mockResolvedValue({ ...record, id: 3, role: 'WARDEN' });
    hasher.compare.mockResolvedValue(true);
    sessions.issue.mockResolvedValue(session);
    await expect(login.execute({ email: 'a@b.it', password: 'giusta123' })).resolves.toBe(session);
    expect(sessions.issue).toHaveBeenCalledWith({
      id: 3,
      email: 'a@b.it',
      role: 'WARDEN',
      mustChangePassword: false,
    });
  });

  // MH-07: the first login of an account created by the staff.
  it('reports the forced change of the password in the session', async () => {
    users.findByEmail.mockResolvedValue({ ...record, mustChangePassword: true });
    hasher.compare.mockResolvedValue(true);
    sessions.issue.mockResolvedValue(session);
    await login.execute({ email: 'a@b.it', password: 'k7mq-x3tz-9pwa' });
    expect(sessions.issue).toHaveBeenCalledWith(
      expect.objectContaining({ mustChangePassword: true }),
    );
  });
});
