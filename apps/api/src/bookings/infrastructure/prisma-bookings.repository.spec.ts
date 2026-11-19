import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { PrismaBookingsRepository } from './prisma-bookings.repository.js';

describe('PrismaBookingsRepository', () => {
  const client = {
    $queryRaw: vi.fn(),
    hiker: { findUnique: vi.fn() },
    booking: {
      create: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    bookingTable: { createMany: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    partyRequirement: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  };
  // Outside a unit of work the context gives the plain client.
  const repository = new PrismaBookingsRepository(
    new TransactionContext(client as unknown as PrismaService),
  );

  // $queryRaw is a tagged template: the SQL text comes first, then the bound values.
  // Nested Prisma.sql fragments are flattened the way the client does before running the query.
  const flatQuery = () => {
    const [strings, ...values] = client.$queryRaw.mock.calls[0] as [string[], ...unknown[]];
    return Prisma.sql(strings as unknown as TemplateStringsArray, ...values);
  };
  const queryText = () => flatQuery().strings.join('?');
  const queryValues = () => flatQuery().values as unknown[];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('findUpcomingSlots', () => {
    const now = new Date('2026-11-01T10:00:00Z');

    it('maps the rows', async () => {
      const startsAt = new Date('2026-11-01T19:00:00Z');
      client.$queryRaw.mockResolvedValue([
        {
          id: 3,
          date: '2026-11-01',
          start_time: '20:00',
          end_time: '22:00',
          starts_at: startsAt,
          free_seats: 5,
        },
      ]);
      await expect(repository.findUpcomingSlots('Europe/Rome', now)).resolves.toEqual([
        {
          id: 3,
          date: '2026-11-01',
          startTime: '20:00',
          endTime: '22:00',
          startsAt,
          freeSeats: 5,
        },
      ]);
    });

    it('counts confirmed and pending bookings and binds the values', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findUpcomingSlots('Europe/Rome', now);
      expect(queryText()).toContain("b.status IN ('CONFIRMED', 'PENDING')");
      expect(queryValues()).toEqual(['Europe/Rome', 'Europe/Rome', now]);
    });
  });

  describe('hasActiveBooking', () => {
    it.each([
      [1, true],
      [0, false],
    ])('with %d bookings returns %s', async (count, expected) => {
      client.booking.count.mockResolvedValue(count);
      await expect(repository.hasActiveBooking(7, 3)).resolves.toBe(expected);
    });

    it('ignores the rejected bookings', async () => {
      client.booking.count.mockResolvedValue(0);
      await repository.hasActiveBooking(7, 3);
      expect(client.booking.count).toHaveBeenCalledWith({
        where: { hikerId: 7, slotId: 3, status: { not: 'REJECTED' } },
      });
    });
  });

  describe('lockSlotAndGetStart', () => {
    it('returns the start of the slot', async () => {
      const startsAt = new Date('2026-11-01T12:00:00Z');
      client.$queryRaw.mockResolvedValue([{ starts_at: startsAt }]);
      await expect(repository.lockSlotAndGetStart(3, 'Europe/Rome')).resolves.toBe(startsAt);
    });

    it('returns null when the slot does not exist', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await expect(repository.lockSlotAndGetStart(3, 'Europe/Rome')).resolves.toBeNull();
    });

    it('locks the row and binds the values instead of concatenating them', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.lockSlotAndGetStart(3, 'Europe/Rome');
      expect(queryText()).toContain('FOR UPDATE');
      expect(queryValues()).toEqual(['Europe/Rome', 3]);
    });
  });

  describe('findFreeSeatsByTable', () => {
    it('maps the rows', async () => {
      client.$queryRaw.mockResolvedValue([
        { table_number: 1, free_seats: 4 },
        { table_number: 2, free_seats: 0 },
      ]);
      await expect(repository.findFreeSeatsByTable(3)).resolves.toEqual([
        { tableNumber: 1, freeSeats: 4 },
        { tableNumber: 2, freeSeats: 0 },
      ]);
    });

    it('returns an empty list for a slot without tables', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await expect(repository.findFreeSeatsByTable(3)).resolves.toEqual([]);
    });

    it('counts the confirmed and pending bookings of the requested slot', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findFreeSeatsByTable(3);
      expect(queryText()).toContain("b.status IN ('CONFIRMED', 'PENDING')");
      // No booking has id 0: every booking counts.
      expect(queryValues()).toEqual([0, 3]);
    });

    it('leaves out the seats of a booking being changed', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findFreeSeatsByTable(3, 9);
      expect(queryText()).toContain('b.id <> ?');
      expect(queryValues()).toEqual([9, 3]);
    });
  });

  describe('findHikerIdByUserId', () => {
    it('returns the hiker id', async () => {
      client.hiker.findUnique.mockResolvedValue({ id: 7 });
      await expect(repository.findHikerIdByUserId(1)).resolves.toBe(7);
      expect(client.hiker.findUnique).toHaveBeenCalledWith({
        where: { userId: 1 },
        select: { id: true },
      });
    });

    it('returns null when the user has no hiker profile', async () => {
      client.hiker.findUnique.mockResolvedValue(null);
      await expect(repository.findHikerIdByUserId(1)).resolves.toBeNull();
    });
  });

  describe('confirmBooking', () => {
    it('confirms the booking only while it is still pending', async () => {
      client.booking.updateMany.mockResolvedValue({ count: 1 });
      await repository.confirmBooking(9);
      expect(client.booking.updateMany).toHaveBeenCalledWith({
        where: { id: 9, status: 'PENDING' },
        data: { status: 'CONFIRMED' },
      });
    });

    it('tells whether the booking was confirmed', async () => {
      client.booking.updateMany.mockResolvedValue({ count: 1 });
      await expect(repository.confirmBooking(9)).resolves.toBe(true);
      // Rejected or already confirmed in the meantime.
      client.booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(repository.confirmBooking(9)).resolves.toBe(false);
    });
  });

  describe('createBooking', () => {
    const fields = { hikerId: 7, slotId: 3, partySize: 2 };
    const data = { ...fields, requirements: [] };

    it('stores the booking as pending', async () => {
      client.booking.create.mockResolvedValue({ id: 9, ...fields, status: 'PENDING' });
      await repository.createBooking(data);
      expect(client.booking.create).toHaveBeenCalledWith({
        data: { ...fields, status: 'PENDING', requirements: { createMany: { data: [] } } },
      });
    });

    it('stores the requirements of the party with the booking', async () => {
      const requirements = [
        { allergies: true, description: 'no nuts' },
        { allergies: false, description: '2 vegetarians' },
      ];
      client.booking.create.mockResolvedValue({ id: 9, ...fields, status: 'PENDING' });
      await repository.createBooking({ ...fields, requirements });
      expect(client.booking.create).toHaveBeenCalledWith({
        data: {
          ...fields,
          status: 'PENDING',
          requirements: { createMany: { data: requirements } },
        },
      });
    });

    it('does not expose the hiker id in the result', async () => {
      client.booking.create.mockResolvedValue({ id: 9, ...fields, status: 'PENDING' });
      await expect(repository.createBooking(data)).resolves.toEqual({
        id: 9,
        slotId: 3,
        partySize: 2,
        status: 'PENDING',
      });
    });
  });

  describe('createBookingTables', () => {
    it('stores one row for each allocated table', async () => {
      await repository.createBookingTables(9, 3, [
        { tableNumber: 1, assignedSeats: 4 },
        { tableNumber: 2, assignedSeats: 2 },
      ]);
      expect(client.bookingTable.createMany).toHaveBeenCalledWith({
        data: [
          { bookingId: 9, slotId: 3, tableNumber: 1, assignedSeats: 4 },
          { bookingId: 9, slotId: 3, tableNumber: 2, assignedSeats: 2 },
        ],
      });
    });
  });

  // MH-06: change a booking.
  describe('lockBooking', () => {
    const row = {
      id: 9,
      hiker_id: 7,
      slot_id: 3,
      party_size: 2,
      status: 'CONFIRMED',
    };

    it('maps the locked booking', async () => {
      client.$queryRaw.mockResolvedValue([row]);
      await expect(repository.lockBooking(9)).resolves.toEqual({
        id: 9,
        hikerId: 7,
        slotId: 3,
        partySize: 2,
        status: 'CONFIRMED',
      });
    });

    it('returns null when the booking does not exist', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await expect(repository.lockBooking(9)).resolves.toBeNull();
    });

    it('locks the row and binds the id instead of concatenating it', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.lockBooking(9);
      expect(queryText()).toContain('FOR UPDATE');
      expect(queryValues()).toEqual([9]);
    });

    it.each([0, -1, 1.5, Number.NaN, 2_147_483_648])(
      'returns null for the id %s without querying the database',
      async (bookingId) => {
        await expect(repository.lockBooking(bookingId)).resolves.toBeNull();
        expect(client.$queryRaw).not.toHaveBeenCalled();
      },
    );

    it('queries the largest id Postgres can store', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.lockBooking(2_147_483_647);
      expect(queryValues()).toEqual([2_147_483_647]);
    });
  });

  describe('findBookingTables', () => {
    it('reads the tables of the booking in table order', async () => {
      const tables = [{ tableNumber: 1, assignedSeats: 2 }];
      client.bookingTable.findMany.mockResolvedValue(tables);
      await expect(repository.findBookingTables(9)).resolves.toBe(tables);
      expect(client.bookingTable.findMany).toHaveBeenCalledWith({
        where: { bookingId: 9 },
        select: { tableNumber: true, assignedSeats: true },
        orderBy: { tableNumber: 'asc' },
      });
    });
  });

  describe('deleteBookingTables', () => {
    it('deletes only the table assignments of the booking', async () => {
      await repository.deleteBookingTables(9);
      expect(client.bookingTable.deleteMany).toHaveBeenCalledWith({ where: { bookingId: 9 } });
    });
  });

  describe('updateBooking', () => {
    const change = { slotId: 4, partySize: 5 };

    it('stores the new slot and party size', async () => {
      client.booking.update.mockResolvedValue({
        id: 9,
        hikerId: 7,
        status: 'CONFIRMED',
        ...change,
      });
      await repository.updateBooking(9, change);
      expect(client.booking.update).toHaveBeenCalledWith({ where: { id: 9 }, data: change });
    });

    it('returns the changed booking without the hiker id, keeping its status', async () => {
      client.booking.update.mockResolvedValue({
        id: 9,
        hikerId: 7,
        status: 'CONFIRMED',
        ...change,
      });
      await expect(repository.updateBooking(9, change)).resolves.toEqual({
        id: 9,
        slotId: 4,
        partySize: 5,
        status: 'CONFIRMED',
      });
    });
  });

  describe('findRequirements', () => {
    it('reads the requirements of the booking in the order they were entered', async () => {
      const needs = [{ allergies: true, description: '1 shellfish allergy' }];
      client.partyRequirement.findMany.mockResolvedValue(needs);
      await expect(repository.findRequirements(9)).resolves.toBe(needs);
      expect(client.partyRequirement.findMany).toHaveBeenCalledWith({
        where: { bookingId: 9 },
        select: { allergies: true, description: true },
        orderBy: { id: 'asc' },
      });
    });
  });

  describe('replaceRequirements', () => {
    it('deletes the old requirements, then stores the new list in one insert', async () => {
      const needs = [
        { allergies: false, description: '2 vegetarians' },
        { allergies: true, description: '1 shellfish allergy' },
      ];
      await repository.replaceRequirements(9, needs);
      expect(client.partyRequirement.deleteMany).toHaveBeenCalledWith({ where: { bookingId: 9 } });
      expect(client.partyRequirement.createMany).toHaveBeenCalledWith({
        data: needs.map((n) => ({ bookingId: 9, ...n })),
      });
      expect(client.partyRequirement.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        client.partyRequirement.createMany.mock.invocationCallOrder[0]!,
      );
    });
  });

  describe('findSlotAt', () => {
    const now = new Date('2026-11-01T10:00:00Z');

    it('returns the id, the start instant and the times of the slot', async () => {
      const startsAt = new Date('2026-11-02T11:00:00Z');
      client.$queryRaw.mockResolvedValue([
        { id: 3, starts_at: startsAt, start_time: '12:00', end_time: '13:00' },
      ]);
      await expect(
        repository.findSlotAt('2026-11-02', '12:34', 'Europe/Rome', now),
      ).resolves.toEqual({ id: 3, startsAt, startTime: '12:00', endTime: '13:00' });
    });

    it('returns null when no slot includes that date and time', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await expect(
        repository.findSlotAt('2026-11-02', '12:34', 'Europe/Rome', now),
      ).resolves.toBeNull();
    });

    it('looks for the slot that starts at or before the time and ends after it', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findSlotAt('2026-11-02', '12:34', 'Europe/Rome', now);
      expect(queryText()).toContain('s.start_time <= ');
      expect(queryText()).toContain('s.end_time > ');
    });

    it('takes the earliest slot, then the oldest, and ignores the slots that have already started', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findSlotAt('2026-11-02', '12:34', 'Europe/Rome', now);
      expect(queryText()).toContain('ORDER BY s.start_time, s.id');
      expect(queryText()).toContain('LIMIT 1');
    });

    it('binds the values instead of concatenating them', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findSlotAt('2026-11-02', '12:34', 'Europe/Rome', now);
      expect(queryValues()).toEqual([
        'Europe/Rome',
        '2026-11-02',
        '12:34',
        '12:34',
        'Europe/Rome',
        now,
      ]);
    });
  });
});
