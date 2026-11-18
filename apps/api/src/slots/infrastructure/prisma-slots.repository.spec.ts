import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { PrismaSlotsRepository } from './prisma-slots.repository.js';

const MAX_DB_INT = 2_147_483_647;
const withTables = {
  tables: { select: { tableNumber: true, seats: true }, orderBy: { tableNumber: 'asc' } },
};
const row = (id: number) => ({
  id,
  date: new Date('2026-11-02T00:00:00.000Z'),
  startTime: new Date('1970-01-01T12:00:00.000Z'),
  endTime: new Date('1970-01-01T13:30:00.000Z'),
  tables: [{ tableNumber: 1, seats: 4 }],
});
const slot = (id: number) => ({
  id,
  date: '2026-11-02',
  startTime: '12:00',
  endTime: '13:30',
  tables: [{ tableNumber: 1, seats: 4 }],
});

describe('PrismaSlotsRepository', () => {
  const client = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    slot: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    slotTable: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    booking: { deleteMany: vi.fn() },
    bookingTable: { deleteMany: vi.fn() },
  };
  // Outside a unit of work the context gives the plain client.
  const repository = new PrismaSlotsRepository(
    new TransactionContext(client as unknown as PrismaService),
  );
  // $queryRaw is a tagged template: the SQL text comes first, then the bound values.
  const queryText = () => (client.$queryRaw.mock.calls[0][0] as string[]).join('?');
  const queryValues = () => client.$queryRaw.mock.calls[0].slice(1) as unknown[];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('findById', () => {
    it('returns the slot with its local date and times and its tables', async () => {
      client.slot.findUnique.mockResolvedValue(row(3));
      await expect(repository.findById(3)).resolves.toEqual(slot(3));
      expect(client.slot.findUnique).toHaveBeenCalledWith({
        where: { id: 3 },
        include: withTables,
      });
    });

    it('returns null when the slot does not exist', async () => {
      client.slot.findUnique.mockResolvedValue(null);
      await expect(repository.findById(3)).resolves.toBeNull();
    });

    it.each([1, MAX_DB_INT])('queries the database for the id %d', async (id) => {
      client.slot.findUnique.mockResolvedValue(null);
      await repository.findById(id);
      expect(client.slot.findUnique).toHaveBeenCalledTimes(1);
    });

    it.each([0, -1, 1.5, MAX_DB_INT + 1, Number.NaN])(
      'returns null without querying for the id %s, which cannot exist',
      async (id) => {
        await expect(repository.findById(id)).resolves.toBeNull();
        expect(client.slot.findUnique).not.toHaveBeenCalled();
      },
    );
  });

  describe('findByDate', () => {
    it('returns the slots of the date ordered by start time', async () => {
      client.slot.findMany.mockResolvedValue([row(3), row(4)]);
      await expect(repository.findByDate('2026-11-02')).resolves.toEqual([slot(3), slot(4)]);
      expect(client.slot.findMany).toHaveBeenCalledWith({
        where: { date: new Date('2026-11-02T00:00:00.000Z') },
        include: withTables,
        orderBy: { startTime: 'asc' },
      });
    });
  });

  describe('lock', () => {
    it('returns true when the slot exists', async () => {
      client.$queryRaw.mockResolvedValue([{ id: 3 }]);
      await expect(repository.lock(3)).resolves.toBe(true);
    });

    it('returns false when the slot does not exist', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await expect(repository.lock(3)).resolves.toBe(false);
    });

    it('locks the row and binds the id instead of concatenating it', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.lock(3);
      expect(queryText()).toContain('FOR UPDATE');
      expect(queryValues()).toEqual([3]);
    });

    it.each([0, -1, 1.5, MAX_DB_INT + 1, Number.NaN])(
      'returns false without querying for the id %s',
      async (id) => {
        await expect(repository.lock(id)).resolves.toBe(false);
        expect(client.$queryRaw).not.toHaveBeenCalled();
      },
    );
  });

  describe('findTables', () => {
    it('returns the tables of the slot ordered by number', async () => {
      const rows = [
        { tableNumber: 1, seats: 4 },
        { tableNumber: 2, seats: 2 },
      ];
      client.slotTable.findMany.mockResolvedValue(rows);
      await expect(repository.findTables(3)).resolves.toBe(rows);
      expect(client.slotTable.findMany).toHaveBeenCalledWith({
        where: { slotId: 3 },
        select: { tableNumber: true, seats: true },
        orderBy: { tableNumber: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('stores the slot with its date and times as database values and returns its id', async () => {
      client.slot.create.mockResolvedValue({ id: 5 });
      await expect(
        repository.create({ date: '2026-11-02', startTime: '12:00', endTime: '13:00' }),
      ).resolves.toBe(5);
      expect(client.slot.create).toHaveBeenCalledWith({
        data: {
          date: new Date('2026-11-02T00:00:00.000Z'),
          startTime: new Date('1970-01-01T12:00:00.000Z'),
          endTime: new Date('1970-01-01T13:00:00.000Z'),
        },
        select: { id: true },
      });
    });
  });

  describe('create on a duplicate', () => {
    const newSlot = { date: '2026-11-02', startTime: '12:00', endTime: '13:00' };

    it('translates the unique violation into a conflict', async () => {
      client.slot.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(repository.create(newSlot)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'A slot with the same date, start and end already exists',
      });
    });

    it('rethrows other database errors', async () => {
      const failure = new Error('database unreachable');
      client.slot.create.mockRejectedValue(failure);
      await expect(repository.create(newSlot)).rejects.toBe(failure);
    });
  });

  // MH-09: repeat a weekly schedule.
  describe('lockDay', () => {
    it('takes the advisory lock of the day and binds the date instead of concatenating it', async () => {
      client.$executeRaw.mockResolvedValue(1);
      await repository.lockDay('2026-11-09');
      const [text, ...values] = client.$executeRaw.mock.calls[0] as [string[], ...unknown[]];
      expect(text.join('?')).toContain('pg_advisory_xact_lock');
      expect(text.join('?')).toContain("'slots-day:'");
      expect(values).toEqual([new Date('2026-11-09T00:00:00.000Z')]);
    });
  });

  describe('findBetween', () => {
    it('returns the slots of the date range, both ends included, ordered by date and start', async () => {
      client.slot.findMany.mockResolvedValue([row(3), row(4)]);
      await expect(repository.findBetween('2026-11-02', '2026-11-08')).resolves.toEqual([
        slot(3),
        slot(4),
      ]);
      expect(client.slot.findMany).toHaveBeenCalledWith({
        where: {
          date: {
            gte: new Date('2026-11-02T00:00:00.000Z'),
            lte: new Date('2026-11-08T00:00:00.000Z'),
          },
        },
        include: withTables,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });
    });
  });

  describe('findReservedDates', () => {
    it('returns each date once, in order, with a pending or confirmed booking', async () => {
      client.slot.findMany.mockResolvedValue([
        { date: new Date('2026-11-10T00:00:00.000Z') },
        { date: new Date('2026-11-18T00:00:00.000Z') },
      ]);
      await expect(repository.findReservedDates('2026-11-09', '2026-11-22')).resolves.toEqual([
        '2026-11-10',
        '2026-11-18',
      ]);
      expect(client.slot.findMany).toHaveBeenCalledWith({
        where: {
          date: {
            gte: new Date('2026-11-09T00:00:00.000Z'),
            lte: new Date('2026-11-22T00:00:00.000Z'),
          },
          bookings: { some: { status: { in: ['PENDING', 'CONFIRMED'] } } },
        },
        select: { date: true },
        distinct: ['date'],
        orderBy: { date: 'asc' },
      });
    });

    it('returns no dates when the range has no reservations', async () => {
      client.slot.findMany.mockResolvedValue([]);
      await expect(repository.findReservedDates('2026-11-09', '2026-11-22')).resolves.toEqual([]);
    });
  });

  describe('deleteSlots', () => {
    it('deletes the booking tables, bookings, slot tables and then the slots', async () => {
      const order: string[] = [];
      for (const model of ['bookingTable', 'booking', 'slotTable', 'slot'] as const) {
        client[model].deleteMany.mockImplementation(() => {
          order.push(model);
          return Promise.resolve({ count: 0 });
        });
      }
      await repository.deleteSlots([7, 8]);
      expect(order).toEqual(['bookingTable', 'booking', 'slotTable', 'slot']);
      expect(client.bookingTable.deleteMany).toHaveBeenCalledWith({
        where: { slotId: { in: [7, 8] } },
      });
      expect(client.booking.deleteMany).toHaveBeenCalledWith({ where: { slotId: { in: [7, 8] } } });
      expect(client.slotTable.deleteMany).toHaveBeenCalledWith({
        where: { slotId: { in: [7, 8] } },
      });
      expect(client.slot.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [7, 8] } } });
    });
  });

  describe('createTables', () => {
    it('stores one row for each table of the slot', async () => {
      await repository.createTables(3, [
        { tableNumber: 1, seats: 4 },
        { tableNumber: 2, seats: 2 },
      ]);
      expect(client.slotTable.createMany).toHaveBeenCalledWith({
        data: [
          { slotId: 3, tableNumber: 1, seats: 4 },
          { slotId: 3, tableNumber: 2, seats: 2 },
        ],
      });
    });
  });
});
