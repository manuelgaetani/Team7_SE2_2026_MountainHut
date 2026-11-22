import { describe, expect, it } from 'vitest';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from './prisma.service.js';
import { TransactionContext } from './transaction-context.js';

describe('TransactionContext', () => {
  const prisma = { name: 'plain client' } as unknown as PrismaService;
  const tx = { name: 'transaction' } as unknown as Prisma.TransactionClient;

  it('hands out the plain client outside a transaction', () => {
    const context = new TransactionContext(prisma);
    expect(context.inTransaction()).toBe(false);
    expect(context.client()).toBe(prisma);
  });

  it('hands out the open transaction inside runIn and returns the work result', async () => {
    const context = new TransactionContext(prisma);
    const result = await context.runIn(tx, async () => {
      expect(context.inTransaction()).toBe(true);
      expect(context.client()).toBe(tx);
      return 42;
    });
    expect(result).toBe(42);
  });

  it('keeps the transaction across awaits inside the work', async () => {
    const context = new TransactionContext(prisma);
    await context.runIn(tx, async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(context.client()).toBe(tx);
    });
  });

  it('goes back to the plain client once the work ends, even when it throws', async () => {
    const context = new TransactionContext(prisma);
    await expect(context.runIn(tx, () => Promise.reject(new Error('stop')))).rejects.toThrow(
      'stop',
    );
    expect(context.inTransaction()).toBe(false);
    expect(context.client()).toBe(prisma);
  });

  it('never shows one run the transaction of a concurrent run', async () => {
    const context = new TransactionContext(prisma);
    const otherTx = { name: 'other' } as unknown as Prisma.TransactionClient;
    const seen = await Promise.all([
      context.runIn(tx, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return context.client();
      }),
      context.runIn(otherTx, async () => context.client()),
    ]);
    expect(seen).toEqual([tx, otherTx]);
  });
});
