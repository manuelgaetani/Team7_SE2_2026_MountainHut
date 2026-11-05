import { ConflictException } from '@nestjs/common';
import { BookingsRepository } from '../src/bookings/bookings.repository.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import type { NotificationService } from '../src/notifications/notification.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createBooking, createHiker, createSlot, resetDatabase } from './integration/database.js';

const TIME_ZONE = 'Europe/Rome';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Bookings with PostgreSQL (integration)', () => {
  const prisma = new PrismaService();
  const repo = new BookingsRepository();

  const notifications = {
    sendBookingConfirmation: () => Promise.resolve('SKIPPED'),
  } as unknown as NotificationService;
  const service = new BookingsService(prisma, repo, notifications);

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

  describe('confirmation by the email', () => {
    it('confirms a pending booking', async () => {
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const bookingId = await createBooking(prisma, hikerId, slotId, 'PENDING', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await expect(repo.confirmBooking(prisma, bookingId)).resolves.toBe(true);
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(booking.status).toBe('CONFIRMED');
    });

    it('does not confirm a rejected booking', async () => {
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const bookingId = await createBooking(prisma, hikerId, slotId, 'REJECTED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await expect(repo.confirmBooking(prisma, bookingId)).resolves.toBe(false);
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(booking.status).toBe('REJECTED');
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
      expect(stored).toMatchObject({ slotId, partySize: 6, status: 'PENDING' });
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
        status: 'PENDING',
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

    it('does not take seats from the other slots of the day', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const lunch = await createSlot(prisma, '2031-07-01', '12:00', '13:00', [6, 6, 6, 6]);
      const later = await createSlot(prisma, '2031-07-01', '13:00', '14:00', [6, 6, 6, 6]);

      await service.create(anna.userId, { slotId: later, partySize: 4 });

      const now = new Date('2031-07-01T08:00:00Z');
      const slots = await repo.findUpcomingSlots(prisma, TIME_ZONE, now);
      expect(slots.find((s) => s.id === lunch)?.freeSeats).toBe(24);
      expect(slots.find((s) => s.id === later)?.freeSeats).toBe(20);

      const result = await service.create(bruno.userId, { slotId: lunch, partySize: 21 });
      expect(result.tables.reduce((sum, t) => sum + t.assignedSeats, 0)).toBe(21);
    });

        it('shares the tables of overlapping slots', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const a = await createSlot(prisma, '2031-07-01', '12:00', '13:30', [6, 6, 6, 6]);
      const b = await createSlot(prisma, '2031-07-01', '12:30', '14:00', [6, 6, 6, 6]);

      await service.create(anna.userId, { slotId: a, partySize: 15 });

      // 24 seats in all, 15 taken during the overlap: 9 are left in both slots.
      const now = new Date('2031-07-01T08:00:00Z');
      const slots = await repo.findUpcomingSlots(prisma, TIME_ZONE, now);
      expect(slots.find((s) => s.id === a)?.freeSeats).toBe(9);
      expect(slots.find((s) => s.id === b)?.freeSeats).toBe(9);

      await expect(
        service.create(bruno.userId, { slotId: b, partySize: 10 }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.create(bruno.userId, { slotId: b, partySize: 9 }),
      ).resolves.toMatchObject({ slotId: b });
    });

    it('does not share the tables of slots that only touch', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const lunch = await createSlot(prisma, '2031-07-01', '12:00', '13:00', [6, 6, 6, 6]);
      const next = await createSlot(prisma, '2031-07-01', '13:00', '14:00', [6, 6, 6, 6]);

      await service.create(anna.userId, { slotId: next, partySize: 4 });

      const now = new Date('2031-07-01T08:00:00Z');
      const slots = await repo.findUpcomingSlots(prisma, TIME_ZONE, now);
      expect(slots.find((s) => s.id === lunch)?.freeSeats).toBe(24);
      expect(slots.find((s) => s.id === next)?.freeSeats).toBe(20);

      const result = await service.create(bruno.userId, { slotId: lunch, partySize: 21 });
      expect(result.tables.reduce((sum, t) => sum + t.assignedSeats, 0)).toBe(21);
    });

    it('lets one of two parallel bookings on overlapping slots through and refuses the other', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const a = await createSlot(prisma, '2031-07-01', '12:00', '13:30', [6, 6, 6, 6]);
      const b = await createSlot(prisma, '2031-07-01', '12:30', '14:00', [6, 6, 6, 6]);

      const results = await Promise.allSettled([
        service.create(anna.userId, { slotId: a, partySize: 15 }),
        service.create(bruno.userId, { slotId: b, partySize: 15 }),
      ]);

      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      // A 409, not a deadlock or any other database error.
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
      const seats = await prisma.bookingTable.aggregate({ _sum: { assignedSeats: true } });
      expect(seats._sum.assignedSeats).toBe(15);
    });

    it('never ends in a deadlock when overlapping slots are booked in parallel', async () => {
      for (let round = 0; round < 10; round++) {
        await resetDatabase(prisma);
        const anna = await createHiker(prisma, 'anna@example.test');
        const bruno = await createHiker(prisma, 'bruno@example.test');
        const a = await createSlot(prisma, '2031-07-01', '12:00', '13:30', [6, 6, 6, 6]);
        const b = await createSlot(prisma, '2031-07-01', '12:30', '14:00', [6, 6, 6, 6]);

        const results = await Promise.allSettled([
          service.create(anna.userId, { slotId: a, partySize: 15 }),
          service.create(bruno.userId, { slotId: b, partySize: 15 }),
        ]);

        for (const r of results) {
          if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(ConflictException);
        }
      }
    }, 30_000);
  });

  it('prevents overbooking across overlapping slots (12:00 and 12:30) in parallel', async () => {
  const anna = await createHiker(prisma, 'anna@example.test');
  const bruno = await createHiker(prisma, 'bruno@example.test');

  // Slot 1: 12:00 - 13:30 (Totale 24 posti sui tavoli)
  const slot1200 = await createSlot(prisma, '2031-07-01', '12:00', '13:30', [6, 6, 6, 6]);
  // Slot 2: 12:30 - 14:00 (Stessa sala, sovrapposto dalle 12:30 alle 13:30)
  const slot1230 = await createSlot(prisma, '2031-07-01', '12:30', '14:00', [6, 6, 6, 6]);

  // Lanciamo in parallelo nello stesso millisecondo:
  // Anna prenota 15 posti alle 12:00, Bruno prenota 15 posti alle 12:30.
  // Totale richiesto per la finestra 12:30-13:30 = 30 posti (> 24 disponibili).
  const [res1200, res1230] = await Promise.allSettled([
    service.create(anna.userId, { slotId: slot1200, partySize: 15 }),
    service.create(bruno.userId, { slotId: slot1230, partySize: 15 }),
  ]);

  const fulfilled = [res1200, res1230].filter((r) => r.status === 'fulfilled');
  const rejected = [res1200, res1230].filter((r) => r.status === 'rejected');

  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
});
});
