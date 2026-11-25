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

    // MH-08: a cancelled booking, like a rejected one, lets the hiker book the slot again.
    it('ignores the rejected and the cancelled bookings', async () => {
      client.booking.count.mockResolvedValue(0);
      await repository.hasActiveBooking(7, 3);
      expect(client.booking.count).toHaveBeenCalledWith({
        where: { hikerId: 7, slotId: 3, status: { notIn: ['REJECTED', 'CANCELLED'] } },
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

  describe('findUpcomingBookingsOfHiker', () => {
    const now = new Date('2026-11-15T10:00:00Z');
    const row = {
      id: 9,
      slot_id: 3,
      date: '2026-11-21',
      start_time: '12:00',
      end_time: '13:30',
      party_size: 4,
      status: 'CONFIRMED',
    };

    it('maps the rows, with the requirements of MH-05 as they come', async () => {
      const requirements = [
        { restrictions: [], allergies: true, description: '1 vegan, peanut allergy' },
        { restrictions: [], allergies: false, description: '2 vegetarians' },
      ];
      client.$queryRaw.mockResolvedValue([{ ...row, requirements }]);
      await expect(repository.findUpcomingBookingsOfHiker(7, 'Europe/Rome', now)).resolves.toEqual([
        {
          id: 9,
          slotId: 3,
          date: '2026-11-21',
          startTime: '12:00',
          endTime: '13:30',
          partySize: 4,
          requirements,
          status: 'CONFIRMED',
        },
      ]);
    });

    it('keeps an empty list of requirements', async () => {
      client.$queryRaw.mockResolvedValue([{ ...row, requirements: [] }]);
      const [booking] = await repository.findUpcomingBookingsOfHiker(7, 'Europe/Rome', now);
      expect(booking.requirements).toEqual([]);
    });

    it('reads the requirements from party_requirements, in their order, [] when none', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findUpcomingBookingsOfHiker(7, 'Europe/Rome', now);
      expect(queryText()).toContain('FROM party_requirements pr');
      expect(queryText()).toContain('ORDER BY pr.id');
      expect(queryText()).toContain("'[]'::json");
      expect(queryText()).not.toContain('b.requirements');
    });

    it('only takes the slots not started yet, the soonest first, and binds the values', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findUpcomingBookingsOfHiker(7, 'Europe/Rome', now);
      expect(queryText()).toContain('WHERE b.hiker_id = ?');
      expect(queryText()).toContain('ORDER BY s.date, s.start_time, b.id');
      expect(queryValues()).toEqual([7, 'Europe/Rome', now]);
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
        { restrictions: [], allergies: true, description: 'no nuts' },
        { restrictions: [], allergies: false, description: '2 vegetarians' },
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

    // MH-07 (white-box): the staff store the booking as CONFIRMED at once.
    it('stores the status it is given instead of pending', async () => {
      client.booking.create.mockResolvedValue({ id: 9, ...fields, status: 'CONFIRMED' });
      await expect(
        repository.createBooking({ ...data, status: 'CONFIRMED' }),
      ).resolves.toMatchObject({ status: 'CONFIRMED' });
      expect(client.booking.create).toHaveBeenCalledWith({
        data: { ...fields, status: 'CONFIRMED', requirements: { createMany: { data: [] } } },
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

  // MH-06 and MH-08: the booking locked before changing or cancelling it.
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

    it.each(['CONFIRMED', 'PENDING', 'REJECTED', 'CANCELLED'] as const)(
      'returns the status %s as read',
      async (status) => {
        client.$queryRaw.mockResolvedValue([{ ...row, status }]);
        await expect(repository.lockBooking(9)).resolves.toStrictEqual({
          id: 9,
          hikerId: 7,
          slotId: 3,
          partySize: 2,
          status,
        });
      },
    );

    it('reads only the bookings table, by id', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.lockBooking(9);
      const sql = queryText().replace(/\s+/g, ' ');
      expect(sql).toContain('SELECT id, hiker_id, slot_id, party_size, status FROM bookings');
      expect(sql).toContain('WHERE id = ? FOR UPDATE');
      expect(sql).not.toContain('JOIN');
    });

    it('propagates a database error', async () => {
      const failure = new Error('lock timeout');
      client.$queryRaw.mockRejectedValue(failure);
      await expect(repository.lockBooking(9)).rejects.toBe(failure);
    });

    it('queries the database for the smallest valid id', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.lockBooking(1);
      expect(queryValues()).toEqual([1]);
    });

    it('queries the largest id Postgres can store', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.lockBooking(2_147_483_647);
      expect(queryValues()).toEqual([2_147_483_647]);
    });
  });

  describe('cancelBooking', () => {
    const cancelled = {
      id: 9,
      hikerId: 7,
      slotId: 3,
      partySize: 2,
      requirements: null,
      status: 'CANCELLED',
      createdAt: new Date('2026-11-01T10:00:00Z'),
    };

    it('marks the booking as cancelled', async () => {
      client.booking.update.mockResolvedValue(cancelled);
      await repository.cancelBooking(9);
      expect(client.booking.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { status: 'CANCELLED' },
      });
    });

    it('keeps the table assignments as history: the seat queries only count active bookings', async () => {
      client.booking.update.mockResolvedValue(cancelled);
      await repository.cancelBooking(9);
      expect(client.bookingTable.deleteMany).not.toHaveBeenCalled();
    });

    it('updates only the status, so the history of the booking is kept', async () => {
      client.booking.update.mockResolvedValue(cancelled);
      await repository.cancelBooking(9);
      const [{ data }] = client.booking.update.mock.calls[0] as [{ data: object }];
      expect(Object.keys(data)).toEqual(['status']);
    });

    it('propagates a database error, e.g. a booking deleted in the meantime', async () => {
      const failure = new Error('Record to update not found');
      client.booking.update.mockRejectedValue(failure);
      await expect(repository.cancelBooking(9)).rejects.toBe(failure);
    });

    it('returns the cancelled booking without the hiker id', async () => {
      client.booking.update.mockResolvedValue(cancelled);
      await expect(repository.cancelBooking(9)).resolves.toEqual({
        id: 9,
        slotId: 3,
        partySize: 2,
        status: 'CANCELLED',
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
      const needs = [{ restrictions: [], allergies: true, description: '1 shellfish allergy' }];
      client.partyRequirement.findMany.mockResolvedValue(needs);
      await expect(repository.findRequirements(9)).resolves.toBe(needs);
      expect(client.partyRequirement.findMany).toHaveBeenCalledWith({
        where: { bookingId: 9 },
        select: { restrictions: true, allergies: true, description: true },
        orderBy: { id: 'asc' },
      });
    });
  });

  describe('replaceRequirements', () => {
    it('deletes the old requirements, then stores the new list in one insert', async () => {
      const needs = [
        { restrictions: [], allergies: false, description: '2 vegetarians' },
        { restrictions: [], allergies: true, description: '1 shellfish allergy' },
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
