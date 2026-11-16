import { vi } from 'vitest';
import { loadAppConfig } from '../../src/config/app-config.js';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { PrismaUnitOfWork } from '../../src/infrastructure/prisma/prisma-unit-of-work.js';
import { TransactionContext } from '../../src/infrastructure/prisma/transaction-context.js';
import { PrismaSlotsRepository } from '../../src/slots/infrastructure/prisma-slots.repository.js';
import { resetDatabase } from './database.js';

const slot = { date: '2032-06-15', startTime: '12:00', endTime: '14:00' };

describe('PrismaUnitOfWork with PostgreSQL (integration)', () => {
  const config = loadAppConfig({ ...process.env, JWT_SECRET: 'int-test-secret' });
  const prisma = new PrismaService(config);
  const context = new TransactionContext(prisma);
  const uow = new PrismaUnitOfWork(prisma, context);
  const slots = new PrismaSlotsRepository(context);

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('commits the writes of a run that succeeds', async () => {
    const id = await uow.run(() => slots.create(slot));
    await expect(slots.findById(id)).resolves.toMatchObject({ id, ...slot, tables: [] });
  });

  it('rolls back the writes of a run that throws', async () => {
    let id = 0;
    await expect(
      uow.run(async () => {
        id = await slots.create(slot);
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');

    expect(id).toBeGreaterThan(0);
    await expect(slots.findById(id)).resolves.toBeNull();
    await expect(prisma.slot.count()).resolves.toBe(0);
  });

  it('lets the repositories of a run read what the run has written', async () => {
    const found = await uow.run(async () => {
      const id = await slots.create(slot);
      await slots.createTables(id, [{ tableNumber: 1, seats: 4 }]);
      return slots.findById(id);
    });
    expect(found?.tables).toEqual([{ tableNumber: 1, seats: 4 }]);
  });

  it('does not show the writes of a run outside it before the commit', async () => {
    await uow.run(async () => {
      await slots.create(slot);
      // The plain client is another connection: the row is not committed yet.
      await expect(prisma.slot.count()).resolves.toBe(0);
    });
    await expect(prisma.slot.count()).resolves.toBe(1);
  });

  it('runs a nested run in the transaction of the outer one', async () => {
    const transaction = vi.spyOn(prisma, '$transaction');
    await expect(
      uow.run(async () => {
        await uow.run(() => slots.create(slot));
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');

    expect(transaction).toHaveBeenCalledTimes(1);
    await expect(prisma.slot.count()).resolves.toBe(0);
  });

  it('gives the plain client outside a run and the transaction inside', async () => {
    expect(context.client()).toBe(prisma);
    await uow.run(async () => {
      expect(context.client()).not.toBe(prisma);
    });
    expect(context.client()).toBe(prisma);
  });
});
