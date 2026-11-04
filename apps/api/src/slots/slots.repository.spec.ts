import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../generated/prisma/client.js';
import { SlotsRepository } from './slots.repository.js';

const MAX_DB_INT = 2_147_483_647;
const withTables = {
  tables: { select: { tableNumber: true, seats: true }, orderBy: { tableNumber: 'asc' } },
};

describe('SlotsRepository', () => {
  const repository = new SlotsRepository();
  const client = {
    $queryRaw: vi.fn(),
    slot: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    slotTable: { findMany: vi.fn(), createMany: vi.fn() },
  };
  const tx = client as unknown as Prisma.TransactionClient;
  // $queryRaw is a tagged template: the SQL text comes first, then the bound values.
  const queryText = () => (client.$queryRaw.mock.calls[0][0] as string[]).join('?');
  const queryValues = () => client.$queryRaw.mock.calls[0].slice(1) as unknown[];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('findById', () => {
    it('returns the slot with its tables', async () => {
      const slot = { id: 3, tables: [] };
      client.slot.findUnique.mockResolvedValue(slot);
      await expect(repository.findById(tx, 3)).resolves.toBe(slot);
      expect(client.slot.findUnique).toHaveBeenCalledWith({
        where: { id: 3 },
        include: withTables,
      });
    });

    it('returns null when the slot does not exist', async () => {
      client.slot.findUnique.mockResolvedValue(null);
      await expect(repository.findById(tx, 3)).resolves.toBeNull();
    });

    it.each([1, MAX_DB_INT])('queries the database for the id %d', async (id) => {
      client.slot.findUnique.mockResolvedValue(null);
      await repository.findById(tx, id);
      expect(client.slot.findUnique).toHaveBeenCalledTimes(1);
    });

    it.each([0, -1, 1.5, MAX_DB_INT + 1, Number.NaN])(
      'returns null without querying for the id %s, which cannot exist',
      async (id) => {
        await expect(repository.findById(tx, id)).resolves.toBeNull();
        expect(client.slot.findUnique).not.toHaveBeenCalled();
      },
    );
  });

  describe('findByDate', () => {
    it('returns the slots of the date ordered by start time', async () => {
      const slots = [{ id: 3 }, { id: 4 }];
      const date = new Date('2026-11-02T00:00:00.000Z');
      client.slot.findMany.mockResolvedValue(slots);
      await expect(repository.findByDate(tx, date)).resolves.toBe(slots);
      expect(client.slot.findMany).toHaveBeenCalledWith({
        where: { date },
        include: withTables,
        orderBy: { startTime: 'asc' },
      });
    });
  });

  describe('lock', () => {
    it('returns true when the slot exists', async () => {
      client.$queryRaw.mockResolvedValue([{ id: 3 }]);
      await expect(repository.lock(tx, 3)).resolves.toBe(true);
    });

    it('returns false when the slot does not exist', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await expect(repository.lock(tx, 3)).resolves.toBe(false);
    });

    it('locks the row and binds the id instead of concatenating it', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.lock(tx, 3);
      expect(queryText()).toContain('FOR UPDATE');
      expect(queryValues()).toEqual([3]);
    });

    it.each([0, -1, 1.5, MAX_DB_INT + 1, Number.NaN])(
      'returns false without querying for the id %s',
      async (id) => {
        await expect(repository.lock(tx, id)).resolves.toBe(false);
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
      await expect(repository.findTables(tx, 3)).resolves.toBe(rows);
      expect(client.slotTable.findMany).toHaveBeenCalledWith({
        where: { slotId: 3 },
        select: { tableNumber: true, seats: true },
        orderBy: { tableNumber: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('stores the slot and returns its id', async () => {
      const data = {
        date: new Date('2026-11-02T00:00:00.000Z'),
        startTime: new Date('1970-01-01T12:00:00.000Z'),
        endTime: new Date('1970-01-01T13:00:00.000Z'),
      };
      client.slot.create.mockResolvedValue({ id: 5 });
      await expect(repository.create(tx, data)).resolves.toBe(5);
      expect(client.slot.create).toHaveBeenCalledWith({ data, select: { id: true } });
    });
  });

  describe('createTables', () => {
    it('stores one row for each table of the slot', async () => {
      await repository.createTables(tx, 3, [
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
