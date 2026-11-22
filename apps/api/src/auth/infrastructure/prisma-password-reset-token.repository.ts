import { Injectable } from '@nestjs/common';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { PasswordResetTokenRepository } from '../application/ports.js';

// Uses the transaction of the current unit of work, or the plain client outside one.
@Injectable()
export class PrismaPasswordResetTokenRepository extends PasswordResetTokenRepository {
  constructor(private readonly context: TransactionContext) {
    super();
  }

  private db() {
    return this.context.client();
  }

  async create(userId: number, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db().passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
  }

  async invalidateAllForUser(userId: number): Promise<void> {
    await this.db().passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  async consume(tokenHash: string, now: Date): Promise<number | null> {
    // One UPDATE: of two concurrent requests with the same link, only one changes the row.
    const { count } = await this.db().passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) return null;
    const row = await this.db().passwordResetToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }
}
