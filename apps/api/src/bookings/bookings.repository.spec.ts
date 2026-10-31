import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../generated/prisma/client.js';
import { BookingsRepository } from './bookings.repository.js';

describe('BookingsRepository', () => {
  const repository = new BookingsRepository();
  const client = {
    $queryRaw: vi.fn(),
    hiker: { findUnique: vi.fn() },
    booking: { create: vi.fn() },
    bookingTable: { createMany: vi.fn() },
  };
  const tx = client as unknown as Prisma.TransactionClient;

  // $queryRaw is a tagged template: the SQL text comes first, then the bound values.
  const queryText = () => (client.$queryRaw.mock.calls[0][0] as string[]).join('?');
  const queryValues = () => client.$queryRaw.mock.calls[0].slice(1) as unknown[];

  beforeEach(() => {
    vi.resetAllMocks();
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

    it('counts only the confirmed bookings of the requested slot', async () => {
      client.$queryRaw.mockResolvedValue([]);
      await repository.findFreeSeatsByTable(tx, 3);
      expect(queryText()).toContain("b.status = 'CONFIRMED'");
      expect(queryValues()).toEqual([3]);
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

  describe('createConfirmedBooking', () => {
    const data = { hikerId: 7, slotId: 3, partySize: 2 };

    it('stores the booking as confirmed', async () => {
      client.booking.create.mockResolvedValue({ id: 9, ...data, status: 'CONFIRMED' });
      await repository.createConfirmedBooking(tx, data);
      expect(client.booking.create).toHaveBeenCalledWith({
        data: { ...data, status: 'CONFIRMED' },
      });
    });

    it('does not expose the hiker id in the result', async () => {
      client.booking.create.mockResolvedValue({ id: 9, ...data, status: 'CONFIRMED' });
      await expect(repository.createConfirmedBooking(tx, data)).resolves.toEqual({
        id: 9,
        slotId: 3,
        partySize: 2,
        status: 'CONFIRMED',
      });
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
});
