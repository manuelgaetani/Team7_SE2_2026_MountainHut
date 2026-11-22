import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from './prisma.service.js';
import { PrismaUnitOfWork } from './prisma-unit-of-work.js';
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

describe('TransactionContext', () => {
  it('returns the plain Prisma client outside a transaction and reports inTransaction as false', () => {
    const prisma = { kind: 'plain' } as unknown as PrismaService;
    const context = new TransactionContext(prisma);

    expect(context.inTransaction()).toBe(false);
    expect(context.client()).toBe(prisma);
  });

  it('exposes the transaction client across async steps and resets once runIn finishes', async () => {
    const prisma = { kind: 'plain' } as unknown as PrismaService;
    const tx = { kind: 'tx' } as unknown as Prisma.TransactionClient;
    const context = new TransactionContext(prisma);

    const outcome = await context.runIn(tx, async () => {
      expect(context.inTransaction()).toBe(true);
      expect(context.client()).toBe(tx);
      await Promise.resolve();
      expect(context.client()).toBe(tx);
      return 'ok';
    });

    expect(outcome).toBe('ok');
    expect(context.inTransaction()).toBe(false);
    expect(context.client()).toBe(prisma);
  });

  it('keeps concurrent runIn calls isolated from each other and cleans up on rejection', async () => {
    const prisma = { kind: 'plain' } as unknown as PrismaService;
    const txA = { kind: 'txA' } as unknown as Prisma.TransactionClient;
    const txB = { kind: 'txB' } as unknown as Prisma.TransactionClient;
    const context = new TransactionContext(prisma);

    const [first, second] = await Promise.allSettled([
      context.runIn(txA, async () => {
        await Promise.resolve();
        expect(context.client()).toBe(txA);
        return 'a';
      }),
      context.runIn(txB, async () => {
        await Promise.resolve();
        expect(context.client()).toBe(txB);
        throw new Error('boom');
      }),
    ]);

    expect(first).toEqual({ status: 'fulfilled', value: 'a' });
    expect(second).toMatchObject({ status: 'rejected' });
    expect(context.inTransaction()).toBe(false);
    expect(context.client()).toBe(prisma);
  });
});

describe('PrismaUnitOfWork', () => {
  it('starts a Prisma transaction, sets the context, and returns the work result', async () => {
    const tx = { kind: 'tx' } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: vi.fn((cb: (client: Prisma.TransactionClient) => Promise<unknown>) => cb(tx)),
    };
    const context = new TransactionContext(prisma as unknown as PrismaService);
    const uow = new PrismaUnitOfWork(prisma as unknown as PrismaService, context);

    const result = await uow.run(async () => {
      expect(context.inTransaction()).toBe(true);
      expect(context.client()).toBe(tx);
      await Promise.resolve();
      return 42;
    });

    expect(result).toBe(42);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(context.inTransaction()).toBe(false);
    expect(context.client()).toBe(prisma);
  });

  it('reuses the active outer transaction when run is nested instead of opening a second one', async () => {
    const outerTx = { kind: 'outerTx' } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: vi.fn((cb: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        cb(outerTx),
      ),
    };
    const context = new TransactionContext(prisma as unknown as PrismaService);
    const uow = new PrismaUnitOfWork(prisma as unknown as PrismaService, context);

    const result = await uow.run(async () => {
      expect(context.client()).toBe(outerTx);
      const inner = await uow.run(async () => {
        expect(context.inTransaction()).toBe(true);
        expect(context.client()).toBe(outerTx);
        await Promise.resolve();
        return 'inner';
      });
      expect(context.client()).toBe(outerTx);
      return `outer:${inner}`;
    });

    expect(result).toBe('outer:inner');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(context.inTransaction()).toBe(false);
  });

  it('propagates errors from work and restores the plain client outside the transaction', async () => {
    const tx = { kind: 'tx' } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: vi.fn((cb: (client: Prisma.TransactionClient) => Promise<unknown>) => cb(tx)),
    };
    const context = new TransactionContext(prisma as unknown as PrismaService);
    const uow = new PrismaUnitOfWork(prisma as unknown as PrismaService, context);

    await expect(
      uow.run(() => {
        expect(context.inTransaction()).toBe(true);
        return Promise.reject(new Error('tx failed'));
      }),
    ).rejects.toThrow('tx failed');

    expect(context.inTransaction()).toBe(false);
    expect(context.client()).toBe(prisma);
  });
});
