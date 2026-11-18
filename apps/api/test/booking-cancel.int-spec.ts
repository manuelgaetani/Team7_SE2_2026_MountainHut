import { MAX_DB_INT } from '@mountain-hut/shared';
import { BookingsService } from '../src/bookings/application/bookings.service.js';
import type { ConfirmationSender } from '../src/bookings/application/confirmation-sender.js';
import { PrismaBookingsRepository } from '../src/bookings/infrastructure/prisma-bookings.repository.js';
import { loadAppConfig } from '../src/config/app-config.js';
import { PrismaUnitOfWork } from '../src/infrastructure/prisma/prisma-unit-of-work.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../src/infrastructure/prisma/transaction-context.js';
import { createBooking, createHiker, createSlot, resetDatabase } from './integration/database.js';

// A dinner slot far in the future: BookingsService.create reads the real clock.
const DATE = '2031-07-01';
const START = '19:00';
const END = '21:00';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Cancel a booking with PostgreSQL (integration) - MH-08', () => {
  const config = loadAppConfig({ ...process.env, JWT_SECRET: 'int-test-secret' });
  const prisma = new PrismaService(config);
  const context = new TransactionContext(prisma);
  const uow = new PrismaUnitOfWork(prisma, context);
  const repo = new PrismaBookingsRepository(context);
  const confirmationSender = { send: () => Promise.resolve() } as unknown as ConfirmationSender;
  const service = new BookingsService(uow, repo, confirmationSender, config);

  const statusOf = async (bookingId: number) =>
    (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status;

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('cancelling', () => {
    it('cancels a confirmed booking and keeps its table assignments as history', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4, 2]);
      const { userId, hikerId } = await createHiker(prisma, 'anna@example.test');
      const bookingId = await createBooking(prisma, hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 4 },
        { tableNumber: 2, assignedSeats: 1 },
      ]);

      const result = await service.cancel(userId, bookingId);

      expect(result).toEqual({ id: bookingId, slotId, partySize: 5, status: 'CANCELLED' });
      expect(await statusOf(bookingId)).toBe('CANCELLED');
      expect(await prisma.bookingTable.count({ where: { bookingId } })).toBe(2);
    });

    it('cancels a pending booking', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4]);
      const { userId, hikerId } = await createHiker(prisma, 'anna@example.test');
      const bookingId = await createBooking(prisma, hikerId, slotId, 'PENDING', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await expect(service.cancel(userId, bookingId)).resolves.toMatchObject({
        status: 'CANCELLED',
      });
      expect(await statusOf(bookingId)).toBe('CANCELLED');
    });

    it('cancels also a booking whose slot has already started (no cutoff)', async () => {
      const slotId = await createSlot(prisma, '2020-01-15', START, END, [4]);
      const { userId, hikerId } = await createHiker(prisma, 'anna@example.test');
      const bookingId = await createBooking(prisma, hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await expect(service.cancel(userId, bookingId)).resolves.toMatchObject({
        status: 'CANCELLED',
      });
    });

    it('refuses to cancel a booking twice (409) and leaves it cancelled', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4]);
      const { userId, hikerId } = await createHiker(prisma, 'anna@example.test');
      const bookingId = await createBooking(prisma, hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      await service.cancel(userId, bookingId);

      await expect(service.cancel(userId, bookingId)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'This booking is already cancelled',
      });
      expect(await statusOf(bookingId)).toBe('CANCELLED');
    });

    it('refuses to cancel a rejected booking (409) and leaves it rejected', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4]);
      const { userId, hikerId } = await createHiker(prisma, 'anna@example.test');
      const bookingId = await createBooking(prisma, hikerId, slotId, 'REJECTED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await expect(service.cancel(userId, bookingId)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'A rejected booking cannot be cancelled',
      });
      expect(await statusOf(bookingId)).toBe('REJECTED');
    });
  });

  describe('who can cancel what', () => {
    it('answers 404 for a booking that does not exist', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');

      await expect(service.cancel(userId, 999)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Booking not found',
      });
    });

    it('answers 404, without querying PostgreSQL out of range, for ids that cannot exist', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');

      // MAX_DB_INT + 1 would overflow the INTEGER column if it reached the query.
      for (const id of [0, -1, MAX_DB_INT + 1]) {
        await expect(service.cancel(userId, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      }
    });

    it("answers 404 for another hiker's booking and does not touch it", async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4]);
      const owner = await createHiker(prisma, 'anna@example.test');
      const other = await createHiker(prisma, 'bruno@example.test');
      const bookingId = await createBooking(prisma, owner.hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 3 },
      ]);

      await expect(service.cancel(other.userId, bookingId)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Booking not found',
      });
      expect(await statusOf(bookingId)).toBe('CONFIRMED');
      expect(await repo.findFreeSeatsByTable(slotId)).toEqual([{ tableNumber: 1, freeSeats: 1 }]);
    });

    it('answers 403 for a user without a hiker profile', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4]);
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      const bookingId = await createBooking(prisma, hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      const employee = await prisma.user.create({
        data: { email: 'staff@example.test', password: 'not-used' },
      });

      await expect(service.cancel(employee.id, bookingId)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(await statusOf(bookingId)).toBe('CONFIRMED');
    });
  });

  describe('seat release', () => {
    it('gives back the seats of every table of the booking at once', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4, 2, 6]);
      const { userId, hikerId } = await createHiker(prisma, 'anna@example.test');
      const bookingId = await createBooking(prisma, hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 4 },
        { tableNumber: 2, assignedSeats: 2 },
      ]);
      expect(await repo.findFreeSeatsByTable(slotId)).toEqual([
        { tableNumber: 1, freeSeats: 0 },
        { tableNumber: 2, freeSeats: 0 },
        { tableNumber: 3, freeSeats: 6 },
      ]);

      await service.cancel(userId, bookingId);

      expect(await repo.findFreeSeatsByTable(slotId)).toEqual([
        { tableNumber: 1, freeSeats: 4 },
        { tableNumber: 2, freeSeats: 2 },
        { tableNumber: 3, freeSeats: 6 },
      ]);
    });

    it('frees only its own seats on a table shared with another booking', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [6]);
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const annaBooking = await createBooking(prisma, anna.hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      const brunoBooking = await createBooking(prisma, bruno.hikerId, slotId, 'PENDING', [
        { tableNumber: 1, assignedSeats: 3 },
      ]);

      await service.cancel(anna.userId, annaBooking);

      expect(await repo.findFreeSeatsByTable(slotId)).toEqual([{ tableNumber: 1, freeSeats: 3 }]);
      expect(await statusOf(brunoBooking)).toBe('PENDING');
      expect(await prisma.bookingTable.findMany({ where: { bookingId: brunoBooking } })).toEqual([
        expect.objectContaining({ tableNumber: 1, assignedSeats: 3 }),
      ]);
    });

    it('frees the shared table also in an overlapping slot', async () => {
      // Possible only for slots created before overlapping slots were forbidden (MH-02):
      // the two slots share table 1.
      const early = await createSlot(prisma, DATE, '18:00', '20:00', [4]);
      const late = await createSlot(prisma, DATE, START, END, [4]);
      const { userId, hikerId } = await createHiker(prisma, 'anna@example.test');
      const bookingId = await createBooking(prisma, hikerId, early, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 3 },
      ]);
      expect(await repo.findFreeSeatsByTable(late)).toEqual([{ tableNumber: 1, freeSeats: 1 }]);

      await service.cancel(userId, bookingId);

      expect(await repo.findFreeSeatsByTable(late)).toEqual([{ tableNumber: 1, freeSeats: 4 }]);
      expect(await repo.findUpcomingSlots('Europe/Rome', new Date('2031-06-30T12:00:00Z'))).toEqual(
        [
          expect.objectContaining({ id: early, freeSeats: 4 }),
          expect.objectContaining({ id: late, freeSeats: 4 }),
        ],
      );
    });

    it('lets another hiker book the freed seats right after the cancellation', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4]);
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const annaBooking = await service.create(anna.userId, { slotId, partySize: 4 });

      await expect(service.create(bruno.userId, { slotId, partySize: 4 })).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Insufficient seats available for this slot',
      });

      await service.cancel(anna.userId, annaBooking.id);
      const brunoBooking = await service.create(bruno.userId, { slotId, partySize: 4 });

      expect(brunoBooking.tables).toEqual([{ tableNumber: 1, assignedSeats: 4 }]);
    });

    it('lets the same hiker book the same slot again after cancelling', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4]);
      const { userId, hikerId } = await createHiker(prisma, 'anna@example.test');
      const first = await service.create(userId, { slotId, partySize: 2 });
      await service.cancel(userId, first.id);

      const second = await service.create(userId, { slotId, partySize: 4 });

      expect(second.id).not.toBe(first.id);
      const rows = await prisma.booking.findMany({
        where: { hikerId, slotId },
        orderBy: { id: 'asc' },
      });
      expect(rows.map((b) => b.status)).toEqual(['CANCELLED', 'PENDING']);
    });
  });

    describe('database constraints', () => {
    it('the one-active-booking index ignores cancelled bookings, but not two active ones', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4]);
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      await prisma.booking.create({ data: { hikerId, slotId, partySize: 2, status: 'CANCELLED' } });
      await prisma.booking.create({ data: { hikerId, slotId, partySize: 2, status: 'CANCELLED' } });

      await prisma.booking.create({ data: { hikerId, slotId, partySize: 2, status: 'PENDING' } });
      await expect(
        prisma.booking.create({ data: { hikerId, slotId, partySize: 2, status: 'CONFIRMED' } }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('booking lock and atomicity', () => {
    it('lockBooking returns owner and status, or null for a missing booking', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4]);
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      const bookingId = await createBooking(prisma, hikerId, slotId, 'PENDING', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await uow.run(async () => {
        expect(await repo.lockBooking(bookingId)).toEqual({ hikerId, status: 'PENDING' });
        expect(await repo.lockBooking(bookingId + 1)).toBeNull();
      });
    });

    it('makes a second transaction on the same booking wait until the first one ends', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4]);
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      const bookingId = await createBooking(prisma, hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      const events: string[] = [];
      let firstHasLock!: () => void;
      const firstLocked = new Promise<void>((resolve) => (firstHasLock = resolve));

      const first = uow.run(async () => {
        await repo.lockBooking(bookingId);
        events.push('first locked');
        firstHasLock();
        await sleep(300);
        events.push('first done');
      });
      await firstLocked;
      const second = uow.run(async () => {
        await repo.lockBooking(bookingId);
        events.push('second locked');
      });
      await Promise.all([first, second]);

      expect(events).toEqual(['first locked', 'first done', 'second locked']);
    });

    it('does not make a cancellation of another booking wait', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4]);
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const annaBooking = await createBooking(prisma, anna.hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      const brunoBooking = await createBooking(prisma, bruno.hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      const events: string[] = [];
      let firstHasLock!: () => void;
      const firstLocked = new Promise<void>((resolve) => (firstHasLock = resolve));

      const first = uow.run(async () => {
        await repo.lockBooking(annaBooking);
        firstHasLock();
        await sleep(300);
        events.push('anna done');
      });
      await firstLocked;
      const second = service.cancel(bruno.userId, brunoBooking).then(() => {
        events.push('bruno cancelled');
      });
      await Promise.all([first, second]);

      expect(events).toEqual(['bruno cancelled', 'anna done']);
    });

    it('lets only one of two concurrent cancellations of the same booking succeed', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4]);
      const { userId, hikerId } = await createHiker(prisma, 'anna@example.test');
      const bookingId = await createBooking(prisma, hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 3 },
      ]);

      const results = await Promise.allSettled([
        service.cancel(userId, bookingId),
        service.cancel(userId, bookingId),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: 'CONFLICT',
        message: 'This booking is already cancelled',
      });
      expect(await statusOf(bookingId)).toBe('CANCELLED');
      expect(await repo.findFreeSeatsByTable(slotId)).toEqual([{ tableNumber: 1, freeSeats: 4 }]);
    });

    it('rolls the cancellation back with the transaction it runs in', async () => {
      const slotId = await createSlot(prisma, DATE, START, END, [4]);
      const { userId, hikerId } = await createHiker(prisma, 'anna@example.test');
      const bookingId = await createBooking(prisma, hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 4 },
      ]);

      // A nested unit of work reuses the outer transaction: the failure after the
      // cancellation must undo it.
      await expect(
        uow.run(async () => {
          await service.cancel(userId, bookingId);
          expect(await repo.findFreeSeatsByTable(slotId)).toEqual([
            { tableNumber: 1, freeSeats: 4 },
          ]);
          throw new Error('failure after the cancellation');
        }),
      ).rejects.toThrow('failure after the cancellation');

      expect(await statusOf(bookingId)).toBe('CONFIRMED');
      expect(await repo.findFreeSeatsByTable(slotId)).toEqual([{ tableNumber: 1, freeSeats: 0 }]);
    });
  });
});