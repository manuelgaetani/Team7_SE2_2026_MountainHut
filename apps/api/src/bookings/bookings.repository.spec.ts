import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../generated/prisma/client.js';
import { BookingsRepository } from './bookings.repository.js';

describe('BookingsRepository', () => {
  const repository = new BookingsRepository();
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
  };
  const tx = client as unknown as Prisma.TransactionClient;

  // $queryRaw is a tagged template: the SQL text comes first, then the bound values.
  const queryText = () => (client.$queryRaw.mock.calls[0][0] as string[]).join('?');
  const queryValues = () => client.$queryRaw.mock.calls[0].slice(1) as unknown[];

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
      await expect(repository.findUpcomingSlots(tx, 'Europe/Rome', now)).resolves.toEqual([
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
      await repository.findUpcomingSlots(tx, 'Europe/Rome', now);
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
      await expect(repository.hasActiveBooking(tx, 7, 3)).resolves.toBe(expected);
    });

    it('ignores the rejected bookings', async () => {
      client.booking.count.mockResolvedValue(0);
      await repository.hasActiveBooking(tx, 7, 3);
      expect(client.booking.count).toHaveBeenCalledWith({
        where: { hikerId: 7, slotId: 3, status: { not: 'REJECTED' } },
      });
    });
  });

  describe('lockSlotAndGetStart', () => {
    it('returns the start of the slot', async () => {
      const startsAt = new Date('2026-11-01T12:00:00Z');
      client.$queryRaw.mockResolvedValue([{ starts_at: startsAt }]);
      await expect(repository.lockSlotAndGetStart(tx, 3, 'Europe/Rome')).resolves.toBe(startsAt);
    });

    it('returns null when the slot does not exist', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await expect(repository.lockSlotAndGetStart(tx, 3, 'Europe/Rome')).resolves.toBeNull();
    });

    it('locks the row and binds the values instead of concatenating them', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.lockSlotAndGetStart(tx, 3, 'Europe/Rome');
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
      await expect(repository.findFreeSeatsByTable(tx, 3)).resolves.toEqual([
        { tableNumber: 1, freeSeats: 4 },
        { tableNumber: 2, freeSeats: 0 },
      ]);
    });

    it('returns an empty list for a slot without tables', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await expect(repository.findFreeSeatsByTable(tx, 3)).resolves.toEqual([]);
    });

    it('counts the confirmed and pending bookings of the requested slot', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findFreeSeatsByTable(tx, 3);
      expect(queryText()).toContain("b.status IN ('CONFIRMED', 'PENDING')");
      // No booking has id 0: every booking counts.
      expect(queryValues()).toEqual([0, 3]);
    });

    it('leaves out the seats of a booking being changed', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findFreeSeatsByTable(tx, 3, 9);
      expect(queryText()).toContain('b.id <> ?');
      expect(queryValues()).toEqual([9, 3]);
    });
  });

  describe('findHikerIdByUserId', () => {
    it('returns the hiker id', async () => {
      client.hiker.findUnique.mockResolvedValue({ id: 7 });
      await expect(repository.findHikerIdByUserId(tx, 1)).resolves.toBe(7);
      expect(client.hiker.findUnique).toHaveBeenCalledWith({
        where: { userId: 1 },
        select: { id: true },
      });
    });

    it('returns null when the user has no hiker profile', async () => {
      client.hiker.findUnique.mockResolvedValue(null);
      await expect(repository.findHikerIdByUserId(tx, 1)).resolves.toBeNull();
    });
  });

  describe('confirmBooking', () => {
    it('confirms the booking only while it is still pending', async () => {
      client.booking.updateMany.mockResolvedValue({ count: 1 });
      await repository.confirmBooking(tx, 9);
      expect(client.booking.updateMany).toHaveBeenCalledWith({
        where: { id: 9, status: 'PENDING' },
        data: { status: 'CONFIRMED' },
      });
    });

    it('tells whether the booking was confirmed', async () => {
      client.booking.updateMany.mockResolvedValue({ count: 1 });
      await expect(repository.confirmBooking(tx, 9)).resolves.toBe(true);
      // Rejected or already confirmed in the meantime.
      client.booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(repository.confirmBooking(tx, 9)).resolves.toBe(false);
    });
  });

  describe('createBooking', () => {
    const data = { hikerId: 7, slotId: 3, partySize: 2, requirements: null };

    it('stores the booking as pending', async () => {
      client.booking.create.mockResolvedValue({ id: 9, ...data, status: 'PENDING' });
      await repository.createBooking(tx, data);
      expect(client.booking.create).toHaveBeenCalledWith({
        data: { ...data, status: 'PENDING' },
      });
    });

    it('does not expose the hiker id in the result', async () => {
      client.booking.create.mockResolvedValue({ id: 9, ...data, status: 'PENDING' });
      await expect(repository.createBooking(tx, data)).resolves.toEqual({
        id: 9,
        slotId: 3,
        partySize: 2,
        status: 'PENDING',
      });
    });
  });

  describe('findBookingConfirmation', () => {
    const slot = {
      date: new Date('2026-11-14T00:00:00.000Z'),
      startTime: new Date('1970-01-01T12:30:00.000Z'),
      endTime: new Date('1970-01-01T13:30:00.000Z'),
    };
    const row = {
      partySize: 2,
      requirements: 'no nuts',
      hiker: { fullName: 'Anna Rossi', userId: 1, user: { email: 'anna@example.com' } },
      slot,
    };

    it('maps the booking, its hiker and its slot', async () => {
      client.booking.findUnique.mockResolvedValue(row);
      await expect(repository.findBookingConfirmation(tx, 9)).resolves.toEqual({
        recipient: { userId: 1, email: 'anna@example.com' },
        booking: {
          ...slot,
          bookingId: 9,
          fullName: 'Anna Rossi',
          partySize: 2,
          requirements: 'no nuts',
        },
      });
    });

    it('has no email for a hiker without an account', async () => {
      client.booking.findUnique.mockResolvedValue({
        ...row,
        hiker: { fullName: 'Anna Rossi', userId: null, user: null },
      });
      const found = await repository.findBookingConfirmation(tx, 9);
      expect(found?.recipient).toEqual({ userId: null, email: null });
    });

    it('returns null when the booking does not exist', async () => {
      client.booking.findUnique.mockResolvedValue(null);
      await expect(repository.findBookingConfirmation(tx, 9)).resolves.toBeNull();
    });
  });

  describe('createBookingTables', () => {
    it('stores one row for each allocated table', async () => {
      await repository.createBookingTables(tx, 9, 3, [
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
      requirements: 'vegan',
      status: 'CONFIRMED',
    };

    it('maps the locked booking', async () => {
      client.$queryRaw.mockResolvedValue([row]);
      await expect(repository.lockBooking(tx, 9)).resolves.toEqual({
        id: 9,
        hikerId: 7,
        slotId: 3,
        partySize: 2,
        requirements: 'vegan',
        status: 'CONFIRMED',
      });
    });

    it('returns null when the booking does not exist', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await expect(repository.lockBooking(tx, 9)).resolves.toBeNull();
    });

    it('locks the row and binds the id instead of concatenating it', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.lockBooking(tx, 9);
      expect(queryText()).toContain('FOR UPDATE');
      expect(queryValues()).toEqual([9]);
    });

    it.each([0, -1, 1.5, Number.NaN, 2_147_483_648])(
      'returns null for the id %s without querying the database',
      async (bookingId) => {
        await expect(repository.lockBooking(tx, bookingId)).resolves.toBeNull();
        expect(client.$queryRaw).not.toHaveBeenCalled();
      },
    );

    it('queries the largest id Postgres can store', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.lockBooking(tx, 2_147_483_647);
      expect(queryValues()).toEqual([2_147_483_647]);
    });
  });

  describe('findBookingTables', () => {
    it('reads the tables of the booking in table order', async () => {
      const tables = [{ tableNumber: 1, assignedSeats: 2 }];
      client.bookingTable.findMany.mockResolvedValue(tables);
      await expect(repository.findBookingTables(tx, 9)).resolves.toBe(tables);
      expect(client.bookingTable.findMany).toHaveBeenCalledWith({
        where: { bookingId: 9 },
        select: { tableNumber: true, assignedSeats: true },
        orderBy: { tableNumber: 'asc' },
      });
    });
  });

  describe('deleteBookingTables', () => {
    it('deletes only the table assignments of the booking', async () => {
      await repository.deleteBookingTables(tx, 9);
      expect(client.bookingTable.deleteMany).toHaveBeenCalledWith({ where: { bookingId: 9 } });
    });
  });

  describe('updateBooking', () => {
    const change = { slotId: 4, partySize: 5, requirements: null };

    it('stores the new slot, party size and requirements', async () => {
      client.booking.update.mockResolvedValue({
        id: 9,
        hikerId: 7,
        status: 'CONFIRMED',
        ...change,
      });
      await repository.updateBooking(tx, 9, change);
      expect(client.booking.update).toHaveBeenCalledWith({ where: { id: 9 }, data: change });
    });

    it('returns the changed booking without the hiker id, keeping its status', async () => {
      client.booking.update.mockResolvedValue({
        id: 9,
        hikerId: 7,
        status: 'CONFIRMED',
        ...change,
      });
      await expect(repository.updateBooking(tx, 9, change)).resolves.toEqual({
        id: 9,
        slotId: 4,
        partySize: 5,
        status: 'CONFIRMED',
      });
    });
  });
});
