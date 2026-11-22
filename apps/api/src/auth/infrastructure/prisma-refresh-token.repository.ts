import { Injectable } from '@nestjs/common';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { RefreshTokenRepository } from '../application/ports.js';
import type { StoredRefreshToken } from '../application/ports.js';

@Injectable()
export class PrismaRefreshTokenRepository extends RefreshTokenRepository {
  constructor(private readonly context: TransactionContext) {
    super();
  }

  private db() {
    return this.context.client();
  }

  async create(userId: number, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db().refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const row = await this.db().refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      revokedAt: row.revokedAt,
      expiresAt: row.expiresAt,
      user: {
        id: row.user.id,
        email: row.user.email,
        role: row.user.role,
        mustChangePassword: row.user.mustChangePassword,
      },
    };
  }

  async revokeIfActive(id: number): Promise<boolean> {
    const { count } = await this.db().refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count === 1;
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.db().refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeByHash(tokenHash: string): Promise<void> {
    await this.db().refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
