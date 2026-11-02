import { ConflictException } from '@nestjs/common';
import { BookingsRepository } from '../src/bookings/bookings.repository.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createBooking, createHiker, createSlot, resetDatabase } from './integration/database.js';

const TIME_ZONE = 'Europe/Rome';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Bookings with PostgreSQL (integration)', () => {
  const prisma = new PrismaService();
  const repo = new BookingsRepository();
  const service = new BookingsService(prisma, repo);

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('free seats per table', () => {
    it('subtracts confirmed bookings only, not rejected ones', async () => {
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      const { hikerId: other } = await createHiker(prisma, 'bruno@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4, 6, 2]);
      await createBooking(prisma, hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 2, assignedSeats: 4 },
      ]);
      await createBooking(prisma, other, slotId, 'REJECTED', [
        { tableNumber: 1, assignedSeats: 3 },
      ]);

      await expect(repo.findFreeSeatsByTable(prisma, slotId)).resolves.toEqual([
        { tableNumber: 1, freeSeats: 4 },
        { tableNumber: 2, freeSeats: 2 },
        { tableNumber: 3, freeSeats: 2 },
      ]);
    });

    it('returns no tables for a slot without tables', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', []);
      await expect(repo.findFreeSeatsByTable(prisma, slotId)).resolves.toEqual([]);
    });
  });

  describe('upcoming slots', () => {
    const now = new Date('2031-07-01T15:00:00Z');

    it('lists only the slots that have not started, in start order, with their free seats', async () => {
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      const started = await createSlot(prisma, '2031-07-01', '12:00', '14:00', [4]);
      const dinner = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4, 2]);
      const lunch = await createSlot(prisma, '2031-07-02', '12:00', '14:00', []);
      await createBooking(prisma, hikerId, dinner, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 3 },
      ]);

      const slots = await repo.findUpcomingSlots(prisma, TIME_ZONE, now);
      expect(slots.map((s) => s.id)).toEqual([dinner, lunch]);
      expect(slots.map((s) => s.id)).not.toContain(started);
      expect(slots[0]).toMatchObject({
        date: '2031-07-01',
        startTime: '19:00',
        endTime: '21:00',
        freeSeats: 3,
      });
      expect(slots[1].freeSeats).toBe(0);
    });

    // Slot times are hut-local: the instant they start depends on daylight saving time.
    it('converts the hut-local start to the right instant in summer and in winter', async () => {
      await createSlot(prisma, '2031-07-15', '19:00', '21:00', [4]);
      await createSlot(prisma, '2031-12-15', '19:00', '21:00', [4]);

      const slots = await repo.findUpcomingSlots(prisma, TIME_ZONE, now);
      expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
        '2031-07-15T17:00:00.000Z',
        '2031-12-15T18:00:00.000Z',
      ]);
    });
  });

  describe('slot lock', () => {
    it('returns the start instant, or null for a slot that does not exist', async () => {
      const slotId = await createSlot(prisma, '2031-12-15', '19:00', '21:00', [4]);
      await prisma.$transaction(async (tx) => {
        const startsAt = await repo.lockSlotAndGetStart(tx, slotId, TIME_ZONE);
        expect(startsAt?.toISOString()).toBe('2031-12-15T18:00:00.000Z');
        await expect(repo.lockSlotAndGetStart(tx, slotId + 1, TIME_ZONE)).resolves.toBeNull();
      });
    });

    it('makes a second transaction on the same slot wait until the first one ends', async () => {
      const slotId = await createSlot(prisma, '2031-12-15', '19:00', '21:00', [4]);
      const events: string[] = [];
      let firstHasLock!: () => void;
      const firstLocked = new Promise<void>((resolve) => (firstHasLock = resolve));

      const first = prisma.$transaction(async (tx) => {
        await repo.lockSlotAndGetStart(tx, slotId, TIME_ZONE);
        events.push('first locked');
        firstHasLock();
        await sleep(300);
        events.push('first done');
      });
      await firstLocked;
      const second = prisma.$transaction(async (tx) => {
        await repo.lockSlotAndGetStart(tx, slotId, TIME_ZONE);
        events.push('second locked');
      });
      await Promise.all([first, second]);

      expect(events).toEqual(['first locked', 'first done', 'second locked']);
    });
  });

  describe('hiker data', () => {
    it('finds the hiker profile of a user, or null when the user has none', async () => {
      const { userId, hikerId } = await createHiker(prisma, 'anna@example.test');
      const staff = await prisma.user.create({
        data: { email: 'staff@example.test', password: 'not-used', role: 'EMPLOYEE' },
      });
      await expect(repo.findHikerIdByUserId(prisma, userId)).resolves.toBe(hikerId);
      await expect(repo.findHikerIdByUserId(prisma, staff.id)).resolves.toBeNull();
    });

    it('does not count a rejected booking as active', async () => {
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      await createBooking(prisma, hikerId, slotId, 'REJECTED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      await expect(repo.hasActiveBooking(prisma, hikerId, slotId)).resolves.toBe(false);

      await createBooking(prisma, hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      await expect(repo.hasActiveBooking(prisma, hikerId, slotId)).resolves.toBe(true);
    });
  });

  describe('database rules', () => {
    it('allows only one active booking per hiker and slot', async () => {
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      await prisma.booking.create({ data: { hikerId, slotId, partySize: 1, status: 'REJECTED' } });
      await prisma.booking.create({ data: { hikerId, slotId, partySize: 1, status: 'CONFIRMED' } });

      await expect(
        prisma.booking.create({ data: { hikerId, slotId, partySize: 1, status: 'PENDING' } }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('rejects a table assignment on a table of another slot', async () => {
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      const slotA = await createSlot(prisma, '2031-07-01', '12:00', '14:00', [4]);
      const slotB = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const booking = await prisma.booking.create({
        data: { hikerId, slotId: slotA, partySize: 2, status: 'CONFIRMED' },
      });

      await expect(
        prisma.bookingTable.create({
          data: { bookingId: booking.id, slotId: slotB, tableNumber: 1, assignedSeats: 2 },
        }),
      ).rejects.toThrow();
    });

    it('rejects a slot that ends before it starts, a table without seats and an empty party', async () => {
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      await expect(createSlot(prisma, '2031-07-01', '21:00', '19:00', [4])).rejects.toThrow();
      await expect(createSlot(prisma, '2031-07-01', '19:00', '21:00', [0])).rejects.toThrow();
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      await expect(
        prisma.booking.create({ data: { hikerId, slotId, partySize: 0, status: 'CONFIRMED' } }),
      ).rejects.toThrow();
    });
  });

  describe('BookingsService.create', () => {
    it('saves the booking and table assignments that add up to the party', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [2, 2, 5]);

      const result = await service.create(userId, { slotId, partySize: 6 });

      const stored = await prisma.booking.findUniqueOrThrow({
        where: { id: result.id },
        include: { tables: true },
      });
      expect(stored).toMatchObject({ slotId, partySize: 6, status: 'CONFIRMED' });
      expect(stored.tables.reduce((sum, t) => sum + t.assignedSeats, 0)).toBe(6);
      expect(stored.tables.map((t) => t.tableNumber).sort()).toEqual(
        result.tables.map((t) => t.tableNumber).sort(),
      );
    });

    it('lets a hiker book again after a rejected booking, whose seats stay free', async () => {
      const { userId, hikerId } = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      await createBooking(prisma, hikerId, slotId, 'REJECTED', [
        { tableNumber: 1, assignedSeats: 4 },
      ]);

      await expect(service.create(userId, { slotId, partySize: 4 })).resolves.toMatchObject({
        status: 'CONFIRMED',
        tables: [{ tableNumber: 1, assignedSeats: 4 }],
      });
    });

    it('never lets two parallel bookings take the same seats', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      const results = await Promise.allSettled([
        service.create(anna.userId, { slotId, partySize: 3 }),
        service.create(bruno.userId, { slotId, partySize: 3 }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.find((r) => r.status === 'rejected');
      expect((failed as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      const seats = await prisma.bookingTable.aggregate({
        where: { slotId },
        _sum: { assignedSeats: true },
      });
      expect(seats._sum.assignedSeats).toBe(3);
    });
  });
});
