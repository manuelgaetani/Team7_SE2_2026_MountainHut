import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangePassword } from './change-password.js';
import type { PasswordHasher, RefreshTokenRepository, UsersRepository } from './ports.js';
import type { AuthSession, SessionIssuer } from './session-issuer.js';

// MH-07 black box: a hiker whose account was created by the staff must replace the generated
// password; any logged-in user can change their password.

const record = {
  id: 5,
  email: 'anna@example.it',
  role: 'HIKER' as const,
  passwordHash: 'hash-of-generated',
  mustChangePassword: true,
};
const input = { currentPassword: 'Generated1x', newPassword: 'MyOwnPass1' };
const session: AuthSession = {
  token: 'new-access',
  refreshToken: 'new-refresh',
  refreshExpiresAt: new Date('2026-12-01T10:00:00Z'),
  user: { id: 5, email: 'anna@example.it', role: 'HIKER', mustChangePassword: false },
};

describe('ChangePassword', () => {
  const users = { findById: vi.fn(), updatePassword: vi.fn() };
  const hasher = { hash: vi.fn(), compare: vi.fn() };
  const tokens = { revokeAllForUser: vi.fn() };
  const sessions = { issue: vi.fn() };
  let changePassword: ChangePassword;

  // The hasher accepts only the current password against the stored hash.
  const acceptOnly = (password: string) =>
    hasher.compare.mockImplementation((candidate: string) =>
      Promise.resolve(candidate === password),
    );

  beforeEach(() => {
    vi.resetAllMocks();
    changePassword = new ChangePassword(
      users as unknown as UsersRepository,
      hasher as unknown as PasswordHasher,
      tokens as unknown as RefreshTokenRepository,
      sessions as unknown as SessionIssuer,
    );
    users.findById.mockResolvedValue(record);
    hasher.hash.mockResolvedValue('hash-of-new');
    sessions.issue.mockResolvedValue(session);
    acceptOnly(input.currentPassword);
  });

  describe('valid change', () => {
    it('stores the hash of the new password', async () => {
      await changePassword.execute(5, input);
      expect(hasher.hash).toHaveBeenCalledWith('MyOwnPass1');
      expect(users.updatePassword).toHaveBeenCalledWith(5, 'hash-of-new');
    });

    it('closes every other session of the user', async () => {
      await changePassword.execute(5, input);
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith(5);
    });

    it('returns a new session that no longer forces the change', async () => {
      await expect(changePassword.execute(5, input)).resolves.toEqual(session);
      expect(sessions.issue).toHaveBeenCalledWith({
        id: 5,
        email: 'anna@example.it',
        role: 'HIKER',
        mustChangePassword: false,
      });
    });

    it('works also for a user who was not forced to change the password', async () => {
      users.findById.mockResolvedValue({ ...record, mustChangePassword: false });
      await expect(changePassword.execute(5, input)).resolves.toEqual(session);
      expect(users.updatePassword).toHaveBeenCalledWith(5, 'hash-of-new');
    });

    it('works for a staff account too, keeping its role', async () => {
      users.findById.mockResolvedValue({ ...record, role: 'EMPLOYEE', mustChangePassword: false });
      await changePassword.execute(5, input);
      expect(sessions.issue).toHaveBeenCalledWith(expect.objectContaining({ role: 'EMPLOYEE' }));
    });
  });

  describe('rejected change', () => {
    it('answers UNAUTHORIZED when the account no longer exists', async () => {
      users.findById.mockResolvedValue(null);
      await expect(changePassword.execute(5, input)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
      expect(users.updatePassword).not.toHaveBeenCalled();
    });

    it('answers FORBIDDEN, not UNAUTHORIZED, when the current password is wrong', async () => {
      acceptOnly('something-else');
      await expect(
        changePassword.execute(5, { ...input, currentPassword: 'Wrong1234' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'Current password is wrong' });
    });

    it('answers UNPROCESSABLE when the new password is the current one', async () => {
      const same = { currentPassword: 'Generated1x', newPassword: 'Generated1x' };
      await expect(changePassword.execute(5, same)).rejects.toMatchObject({
        code: 'UNPROCESSABLE',
        message: 'New password must be different from the current one',
      });
    });

    it.each([
      ['the current password is wrong', () => acceptOnly('something-else')],
      // Both passwords match the stored hash: the new one is the current one.
      ['the new password is the current one', () => hasher.compare.mockResolvedValue(true)],
      ['the account does not exist', () => users.findById.mockResolvedValue(null)],
    ])('changes nothing and keeps the sessions when %s', async (_case, arrange) => {
      arrange();
      await expect(changePassword.execute(5, input)).rejects.toBeDefined();
      expect(users.updatePassword).not.toHaveBeenCalled();
      expect(tokens.revokeAllForUser).not.toHaveBeenCalled();
      expect(sessions.issue).not.toHaveBeenCalled();
    });
  });
});
