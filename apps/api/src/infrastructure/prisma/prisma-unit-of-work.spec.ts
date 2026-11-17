import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaUnitOfWork } from './prisma-unit-of-work.js';
import type { PrismaService } from './prisma.service.js';
import { TransactionContext } from './transaction-context.js';

describe('PrismaUnitOfWork', () => {
  const tx = { name: 'transaction' } as unknown as Prisma.TransactionClient;
  const $transaction = vi.fn();
  const prisma = { $transaction } as unknown as PrismaService;
  let context: TransactionContext;
  let uow: PrismaUnitOfWork;

  beforeEach(() => {
    vi.resetAllMocks();
    // Like Prisma: runs the callback with a transaction client and returns its result.
    $transaction.mockImplementation((fn: (client: Prisma.TransactionClient) => Promise<unknown>) =>
      fn(tx),
    );
    context = new TransactionContext(prisma);
    uow = new PrismaUnitOfWork(prisma, context);
  });

  it('opens one transaction and runs the work inside it', async () => {
    const result = await uow.run(async () => {
      expect(context.client()).toBe(tx);
      return 'done';
    });
    expect(result).toBe('done');
    expect($transaction).toHaveBeenCalledOnce();
  });

  it('reuses the outer transaction for a nested run', async () => {
    const result = await uow.run(() =>
      uow.run(async () => {
        expect(context.client()).toBe(tx);
        return 'inner';
      }),
    );
    expect(result).toBe('inner');
    expect($transaction).toHaveBeenCalledOnce();
  });

  it('propagates the error of the work so the transaction rolls back', async () => {
    await expect(uow.run(() => Promise.reject(new Error('stop')))).rejects.toThrow('stop');
    expect($transaction).toHaveBeenCalledOnce();
  });
});
