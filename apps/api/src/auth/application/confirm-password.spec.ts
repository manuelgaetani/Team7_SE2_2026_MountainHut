import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmPasswordReset } from './confirm-password-reset.js';
import type {
  PasswordHasher,
  PasswordResetTokenRepository,
  RefreshTokenGenerator,
  RefreshTokenRepository,
  UsersRepository,
} from './ports.js';

// MH-07 black box: the user sets a new password with the code of the link. The link works
// once; after the change every session of the user is closed.

const NOW = new Date('2026-11-18T10:00:00.000Z');
const input = { token: 'raw-code', password: 'MyOwnPass1' };

describe('ConfirmPasswordReset', () => {
  const resetTokens = { create: vi.fn(), invalidateAllForUser: vi.fn(), consume: vi.fn() };
  const codes = { generate: vi.fn(), hash: vi.fn() };
  const users = { updatePassword: vi.fn() };
  const hasher = { hash: vi.fn(), compare: vi.fn() };
  const sessions = { revokeAllForUser: vi.fn() };
  let confirmReset: ConfirmPasswordReset;

  beforeEach(() => {
    vi.resetAllMocks();
    confirmReset = new ConfirmPasswordReset(
      resetTokens as unknown as PasswordResetTokenRepository,
      codes as unknown as RefreshTokenGenerator,
      users as unknown as UsersRepository,
      hasher as unknown as PasswordHasher,
      sessions as unknown as RefreshTokenRepository,
    );
    codes.hash.mockReturnValue('hashed-code');
    hasher.hash.mockResolvedValue('hash-of-new');
  });

  describe('valid link', () => {
    beforeEach(() => {
      resetTokens.consume.mockResolvedValue(5);
    });

    it('spends the link looking it up by the hash of the code, at the given time', async () => {
      await confirmReset.execute(input, NOW);
      expect(codes.hash).toHaveBeenCalledWith('raw-code');
      expect(resetTokens.consume).toHaveBeenCalledWith('hashed-code', NOW);
    });

    it('stores the hash of the new password for the user of the link', async () => {
      await confirmReset.execute(input, NOW);
      expect(hasher.hash).toHaveBeenCalledWith('MyOwnPass1');
      expect(users.updatePassword).toHaveBeenCalledWith(5, 'hash-of-new');
    });

    it('closes every session of the user', async () => {
      await confirmReset.execute(input, NOW);
      expect(sessions.revokeAllForUser).toHaveBeenCalledWith(5);
    });

    it('resolves with nothing: the user logs in again with the new password', async () => {
      await expect(confirmReset.execute(input, NOW)).resolves.toBeUndefined();
    });

    it('uses the current time when none is given', async () => {
      vi.useFakeTimers({ now: NOW });
      try {
        await confirmReset.execute(input);
        expect(resetTokens.consume).toHaveBeenCalledWith('hashed-code', NOW);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('invalid, expired or already used link', () => {
    beforeEach(() => {
      resetTokens.consume.mockResolvedValue(null);
    });

    it('answers UNPROCESSABLE with a message for the user', async () => {
      await expect(confirmReset.execute(input, NOW)).rejects.toMatchObject({
        code: 'UNPROCESSABLE',
        message: 'The link is invalid or has expired',
      });
    });

    it('changes no password and closes no session', async () => {
      await expect(confirmReset.execute(input, NOW)).rejects.toBeDefined();
      expect(hasher.hash).not.toHaveBeenCalled();
      expect(users.updatePassword).not.toHaveBeenCalled();
      expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
    });
  });

  it('a second use of the same link is refused', async () => {
    resetTokens.consume.mockResolvedValueOnce(5).mockResolvedValueOnce(null);
    await expect(confirmReset.execute(input, NOW)).resolves.toBeUndefined();
    await expect(confirmReset.execute(input, NOW)).rejects.toMatchObject({
      code: 'UNPROCESSABLE',
    });
    expect(users.updatePassword).toHaveBeenCalledTimes(1);
  });
});
