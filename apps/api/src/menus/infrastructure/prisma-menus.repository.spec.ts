import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_DB_INT } from '@mountain-hut/shared';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { PrismaMenusRepository } from './prisma-menus.repository.js';

// MH-10 white box: the Prisma queries of the menus (R8). One menu per slot, written with a single
// upsert and deleted with deleteMany; a slot that does not exist is null; the start of a slot and
// the previous menus are raw queries with bound values. The client is a mock.

const select = { slotId: true, text: true, updatedAt: true };
const updatedAt = new Date('2026-11-26T09:30:00.000Z');
const row = { slotId: 12, text: 'Soup', updatedAt };

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test' });

// Ids that cannot be a Postgres INTEGER key: never sent to the database.
const invalidIds = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_DB_INT + 1];

describe('PrismaMenusRepository', () => {
  const client = {
    menu: { upsert: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
    slot: { count: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const repository = new PrismaMenusRepository(
    new TransactionContext(client as unknown as PrismaService),
  );

  // $queryRaw is a tagged template: the SQL text comes first, then the bound values.
  const queryText = () => (client.$queryRaw.mock.calls[0][0] as string[]).join('?');
  const queryValues = () => client.$queryRaw.mock.calls[0].slice(1) as unknown[];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('save', () => {
    it('creates or replaces the menu of the slot in one upsert', async () => {
      client.menu.upsert.mockResolvedValue(row);
      await expect(repository.save(12, 'Soup')).resolves.toEqual(row);
      expect(client.menu.upsert).toHaveBeenCalledTimes(1);
      expect(client.menu.upsert).toHaveBeenCalledWith({
        where: { slotId: 12 },
        create: { slotId: 12, text: 'Soup' },
        update: { text: 'Soup' },
        select,
      });
    });

    it.each([1, MAX_DB_INT])('accepts the boundary id %d', async (id) => {
      client.menu.upsert.mockResolvedValue({ ...row, slotId: id });
      await expect(repository.save(id, 'Soup')).resolves.toMatchObject({ slotId: id });
    });

    it.each(invalidIds)('answers null for the id %d without querying', async (id) => {
      await expect(repository.save(id, 'Soup')).resolves.toBeNull();
      expect(client.menu.upsert).not.toHaveBeenCalled();
    });

    it('answers null when the slot does not exist (foreign key P2003)', async () => {
      client.menu.upsert.mockRejectedValue(known('P2003'));
      await expect(repository.save(999, 'Soup')).resolves.toBeNull();
    });

    it('lets other Prisma errors through', async () => {
      const error = known('P2002');
      client.menu.upsert.mockRejectedValue(error);
      await expect(repository.save(12, 'Soup')).rejects.toBe(error);
    });

    it('lets errors that are not from Prisma through', async () => {
      const error = new Error('connection lost');
      client.menu.upsert.mockRejectedValue(error);
      await expect(repository.save(12, 'Soup')).rejects.toBe(error);
    });
  });

  describe('findBySlot', () => {
    it('reads the menu of the slot by its key', async () => {
      client.menu.findUnique.mockResolvedValue(row);
      await expect(repository.findBySlot(12)).resolves.toEqual(row);
      expect(client.menu.findUnique).toHaveBeenCalledWith({ where: { slotId: 12 }, select });
    });

    it('answers null when the slot has no menu', async () => {
      client.menu.findUnique.mockResolvedValue(null);
      await expect(repository.findBySlot(12)).resolves.toBeNull();
    });

    it.each(invalidIds)('answers null for the id %d without querying', async (id) => {
      await expect(repository.findBySlot(id)).resolves.toBeNull();
      expect(client.menu.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('slotExists', () => {
    it('is true when the slot is counted', async () => {
      client.slot.count.mockResolvedValue(1);
      await expect(repository.slotExists(12)).resolves.toBe(true);
      expect(client.slot.count).toHaveBeenCalledWith({ where: { id: 12 } });
    });

    it('is false when no slot has that id', async () => {
      client.slot.count.mockResolvedValue(0);
      await expect(repository.slotExists(12)).resolves.toBe(false);
    });

    it.each(invalidIds)('is false for the id %d without querying', async (id) => {
      await expect(repository.slotExists(id)).resolves.toBe(false);
      expect(client.slot.count).not.toHaveBeenCalled();
    });
  });

  describe('findSlotStart', () => {
    const startsAt = new Date('2026-12-05T11:00:00.000Z');

    it('answers the start of the slot read by the database', async () => {
      client.$queryRaw.mockResolvedValue([{ starts_at: startsAt }]);
      await expect(repository.findSlotStart(12, 'Europe/Rome')).resolves.toBe(startsAt);
    });

    it('answers null when no slot has that id', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await expect(repository.findSlotStart(999, 'Europe/Rome')).resolves.toBeNull();
    });

    it('binds the time zone and the id as parameters, in this order', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findSlotStart(12, 'Europe/Zurich');
      expect(queryValues()).toEqual(['Europe/Zurich', 12]);
      expect(queryText()).not.toContain('Europe/Zurich');
    });

    it('reads the date and start time of the slot as a local time of the given zone', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findSlotStart(12, 'Europe/Rome');
      const sql = queryText();
      expect(sql).toContain('(s.date + s.start_time) AT TIME ZONE ?::text');
      expect(sql).toContain('AS starts_at');
      expect(sql).toMatch(/FROM slots s\s+WHERE s\.id = \?$/);
    });

    it.each(invalidIds)('answers null for the id %d without querying', async (id) => {
      await expect(repository.findSlotStart(id, 'Europe/Rome')).resolves.toBeNull();
      expect(client.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes the menu of the slot and answers true', async () => {
      client.menu.deleteMany.mockResolvedValue({ count: 1 });
      await expect(repository.delete(12)).resolves.toBe(true);
      expect(client.menu.deleteMany).toHaveBeenCalledTimes(1);
      expect(client.menu.deleteMany).toHaveBeenCalledWith({ where: { slotId: 12 } });
    });

    it('answers false when the slot has no menu (or does not exist)', async () => {
      client.menu.deleteMany.mockResolvedValue({ count: 0 });
      await expect(repository.delete(12)).resolves.toBe(false);
    });

    it.each(invalidIds)('answers false for the id %d without querying', async (id) => {
      await expect(repository.delete(id)).resolves.toBe(false);
      expect(client.menu.deleteMany).not.toHaveBeenCalled();
    });

    it('lets a database failure through', async () => {
      const error = new Error('connection lost');
      client.menu.deleteMany.mockRejectedValue(error);
      await expect(repository.delete(12)).rejects.toBe(error);
    });
  });

  describe('findPrevious', () => {
    it('maps the rows of the query to menus with their slot', async () => {
      client.$queryRaw.mockResolvedValue([
        {
          slot_id: 12,
          text: 'Soup',
          updated_at: updatedAt,
          date: '2026-11-28',
          start_time: '12:00',
          end_time: '14:00',
        },
      ]);
      await expect(repository.findPrevious(50)).resolves.toEqual([
        {
          slotId: 12,
          text: 'Soup',
          updatedAt,
          date: '2026-11-28',
          startTime: '12:00',
          endTime: '14:00',
        },
      ]);
    });

    it('answers an empty list when there are no menus', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await expect(repository.findPrevious(50)).resolves.toEqual([]);
    });

    it('binds the limit as a parameter instead of writing it in the SQL', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findPrevious(7);
      expect(queryValues()).toEqual([7]);
      expect(queryText()).toMatch(/LIMIT \?$/);
    });

    it('keeps each text once, with its latest slot, latest slot first', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findPrevious(50);
      const sql = queryText();
      expect(sql).toContain('DISTINCT ON (m.text)');
      expect(sql).toMatch(
        /ORDER BY m\.text, s\.date DESC, s\.start_time DESC, m\.slot_id DESC[\s\S]*ORDER BY date DESC, start_time DESC, slot_id DESC/,
      );
      expect(sql).toContain('JOIN slots s ON s.id = m.slot_id');
    });

    it('formats the date and times of the slot in the query', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findPrevious(50);
      const sql = queryText();
      expect(sql).toContain("to_char(s.date, 'YYYY-MM-DD')");
      expect(sql).toContain("to_char(s.start_time, 'HH24:MI')");
      expect(sql).toContain("to_char(s.end_time, 'HH24:MI')");
    });
  });
});
