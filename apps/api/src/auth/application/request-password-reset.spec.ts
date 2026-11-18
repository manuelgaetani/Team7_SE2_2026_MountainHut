import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PasswordResetNotifier,
  PasswordResetTokenRepository,
  RefreshTokenGenerator,
  UsersRepository,
} from './ports.js';
import { RequestPasswordReset } from './request-password-reset.js';

// MH-07 black box: a user asks for a link to set a new password. The link lasts 24 hours,
// only the last one works, and the answer does not reveal whether the email is registered.

const NOW = new Date('2026-11-18T10:00:00.000Z');
const IN_24_HOURS = new Date('2026-11-19T10:00:00.000Z');

const record = {
  id: 5,
  email: 'anna@example.it',
  role: 'HIKER' as const,
  passwordHash: 'hash',
  mustChangePassword: false,
};

describe('RequestPasswordReset', () => {
  const users = { findByEmail: vi.fn() };
  const resetTokens = { create: vi.fn(), invalidateAllForUser: vi.fn(), consume: vi.fn() };
  const codes = { generate: vi.fn(), hash: vi.fn() };
  const notifier = { send: vi.fn() };
  let requestReset: RequestPasswordReset;

  beforeEach(() => {
    vi.resetAllMocks();
    requestReset = new RequestPasswordReset(
      users as unknown as UsersRepository,
      resetTokens as unknown as PasswordResetTokenRepository,
      codes as unknown as RefreshTokenGenerator,
      notifier as unknown as PasswordResetNotifier,
    );
    codes.generate.mockReturnValue({ raw: 'raw-code', hash: 'hashed-code' });
    notifier.send.mockResolvedValue(undefined);
  });

  describe('registered email', () => {
    beforeEach(() => {
      users.findByEmail.mockResolvedValue(record);
    });

    it('looks the account up by the email of the request', async () => {
      await requestReset.execute({ email: 'anna@example.it' }, NOW);
      expect(users.findByEmail).toHaveBeenCalledWith('anna@example.it');
    });

    it('stores only the hash of the code, valid for exactly 24 hours', async () => {
      await requestReset.execute({ email: 'anna@example.it' }, NOW);
      expect(resetTokens.create).toHaveBeenCalledWith(5, 'hashed-code', IN_24_HOURS);
      expect(resetTokens.create).not.toHaveBeenCalledWith(5, 'raw-code', expect.anything());
    });

    it('ends the previous links before creating the new one', async () => {
      await requestReset.execute({ email: 'anna@example.it' }, NOW);
      expect(resetTokens.invalidateAllForUser).toHaveBeenCalledWith(5);
      const invalidated = resetTokens.invalidateAllForUser.mock.invocationCallOrder[0];
      const created = resetTokens.create.mock.invocationCallOrder[0];
      expect(invalidated).toBeLessThan(created);
    });

    it('emails the raw code, never the hash, with the expiry', async () => {
      await requestReset.execute({ email: 'anna@example.it' }, NOW);
      expect(notifier.send).toHaveBeenCalledWith(
        { id: 5, email: 'anna@example.it' },
        'raw-code',
        IN_24_HOURS,
      );
    });

    it('answers without waiting for the email to be sent', async () => {
      // An email that never finishes must not keep the request waiting.
      notifier.send.mockReturnValue(new Promise(() => undefined));
      await expect(requestReset.execute({ email: 'anna@example.it' }, NOW)).resolves.toBe(
        undefined,
      );
    });

    it('uses the current time when none is given', async () => {
      vi.useFakeTimers({ now: NOW });
      try {
        await requestReset.execute({ email: 'anna@example.it' });
        expect(resetTokens.create).toHaveBeenCalledWith(5, 'hashed-code', IN_24_HOURS);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('unknown email', () => {
    beforeEach(() => {
      users.findByEmail.mockResolvedValue(null);
    });

    it('answers exactly as for a registered email', async () => {
      await expect(requestReset.execute({ email: 'nobody@example.it' }, NOW)).resolves.toBe(
        undefined,
      );
    });

    it('stores no link and sends no email', async () => {
      await requestReset.execute({ email: 'nobody@example.it' }, NOW);
      expect(codes.generate).not.toHaveBeenCalled();
      expect(resetTokens.invalidateAllForUser).not.toHaveBeenCalled();
      expect(resetTokens.create).not.toHaveBeenCalled();
      expect(notifier.send).not.toHaveBeenCalled();
    });
  });
});
