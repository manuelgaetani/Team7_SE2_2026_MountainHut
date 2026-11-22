import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { PrismaPasswordResetTokenRepository } from './prisma-password-reset-token.repository.js';

// MH-07 white box: the links to set a new password (R8, Decisions: password recovery).

const NOW = new Date('2026-11-20T10:00:00.000Z');
const IN_24_HOURS = new Date('2026-11-21T10:00:00.000Z');

describe('PrismaPasswordResetTokenRepository', () => {
  const client = {
    passwordResetToken: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  };
  const tokens = client.passwordResetToken;
  const repository = new PrismaPasswordResetTokenRepository(
    new TransactionContext(client as unknown as PrismaService),
  );

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('create', () => {
    it('stores the user, the hash of the code and the expiry', async () => {
      await expect(repository.create(5, 'hashed-code', IN_24_HOURS)).resolves.toBeUndefined();
      expect(tokens.create).toHaveBeenCalledWith({
        data: { userId: 5, tokenHash: 'hashed-code', expiresAt: IN_24_HOURS },
      });
    });
  });

  describe('invalidateAllForUser', () => {
    it('spends only the links of the user that are still unused, marking them as used now', async () => {
      vi.useFakeTimers({ now: NOW });
      try {
        tokens.updateMany.mockResolvedValue({ count: 2 });
        await repository.invalidateAllForUser(5);
        expect(tokens.updateMany).toHaveBeenCalledWith({
          where: { userId: 5, usedAt: null },
          data: { usedAt: NOW },
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('does nothing more when the user has no open link', async () => {
      tokens.updateMany.mockResolvedValue({ count: 0 });
      await expect(repository.invalidateAllForUser(5)).resolves.toBeUndefined();
      expect(tokens.create).not.toHaveBeenCalled();
    });
  });

  describe('consume', () => {
    it('spends the link in one conditional UPDATE: unused and not expired at the given time', async () => {
      tokens.updateMany.mockResolvedValue({ count: 1 });
      tokens.findUnique.mockResolvedValue({ userId: 5 });
      await repository.consume('hashed-code', NOW);
      expect(tokens.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: 'hashed-code', usedAt: null, expiresAt: { gt: NOW } },
        data: { usedAt: NOW },
      });
    });

    it('returns the user of the link after spending it', async () => {
      tokens.updateMany.mockResolvedValue({ count: 1 });
      tokens.findUnique.mockResolvedValue({ userId: 5 });
      await expect(repository.consume('hashed-code', NOW)).resolves.toBe(5);
      expect(tokens.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: 'hashed-code' },
        select: { userId: true },
      });
      const updated = tokens.updateMany.mock.invocationCallOrder[0];
      const read = tokens.findUnique.mock.invocationCallOrder[0];
      expect(updated).toBeLessThan(read);
    });

    it('returns null without reading the user when no row changed (unknown, used, expired)', async () => {
      tokens.updateMany.mockResolvedValue({ count: 0 });
      await expect(repository.consume('hashed-code', NOW)).resolves.toBeNull();
      expect(tokens.findUnique).not.toHaveBeenCalled();
    });

    it('returns null if, against the unique hash, more than one row changed', async () => {
      tokens.updateMany.mockResolvedValue({ count: 2 });
      await expect(repository.consume('hashed-code', NOW)).resolves.toBeNull();
      expect(tokens.findUnique).not.toHaveBeenCalled();
    });

    it('returns null if the row disappeared after the update', async () => {
      tokens.updateMany.mockResolvedValue({ count: 1 });
      tokens.findUnique.mockResolvedValue(null);
      await expect(repository.consume('hashed-code', NOW)).resolves.toBeNull();
    });
  });
});
