import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository.js';

describe('PrismaRefreshTokenRepository', () => {
  const client = { refreshToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() } };
  const repository = new PrismaRefreshTokenRepository(
    new TransactionContext(client as unknown as PrismaService),
  );

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('stores the hash of the token with its owner and expiry', async () => {
    const expiresAt = new Date('2026-11-01T10:00:00Z');
    await repository.create(1, 'hashed', expiresAt);
    expect(client.refreshToken.create).toHaveBeenCalledWith({
      data: { userId: 1, tokenHash: 'hashed', expiresAt },
    });
  });

  describe('findByHash', () => {
    it('looks the token up by its hash, with its user and without the password', async () => {
      const expiresAt = new Date('2026-11-01T10:00:00Z');
      client.refreshToken.findUnique.mockResolvedValue({
        id: 5,
        userId: 1,
        tokenHash: 'hashed',
        revokedAt: null,
        expiresAt,
        user: { id: 1, email: 'a@b.it', role: 'EMPLOYEE', password: 'stored-hash' },
      });
      await expect(repository.findByHash('hashed')).resolves.toEqual({
        id: 5,
        userId: 1,
        revokedAt: null,
        expiresAt,
        user: { id: 1, email: 'a@b.it', role: 'EMPLOYEE' },
      });
      expect(client.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: 'hashed' },
        include: { user: true },
      });
    });

    it('returns null for an unknown hash', async () => {
      client.refreshToken.findUnique.mockResolvedValue(null);
      await expect(repository.findByHash('unknown')).resolves.toBeNull();
    });
  });

  describe('revokeIfActive', () => {
    it('revokes the token only if it is not revoked yet', async () => {
      client.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      await expect(repository.revokeIfActive(5)).resolves.toBe(true);
      expect(client.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 5, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('returns false when another request revoked it first', async () => {
      client.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(repository.revokeIfActive(5)).resolves.toBe(false);
    });
  });

  it('revokes every active token of the user', async () => {
    client.refreshToken.updateMany.mockResolvedValue({ count: 2 });
    await repository.revokeAllForUser(1);
    expect(client.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 1, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revokes only the matching token, by hash, if not already revoked', async () => {
    client.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    await repository.revokeByHash('hashed');
    expect(client.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: 'hashed', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
