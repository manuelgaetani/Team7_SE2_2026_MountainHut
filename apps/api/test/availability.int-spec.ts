import { AvailabilityService } from '../src/bookings/application/availability.service.js';
import { BookingsService } from '../src/bookings/application/bookings.service.js';
import type { ConfirmationSender } from '../src/bookings/application/confirmation-sender.js';
import { PrismaBookingsRepository } from '../src/bookings/infrastructure/prisma-bookings.repository.js';
import { loadAppConfig } from '../src/config/app-config.js';
import { PrismaUnitOfWork } from '../src/infrastructure/prisma/prisma-unit-of-work.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../src/infrastructure/prisma/transaction-context.js';
import { createBooking, createHiker, createSlot, resetDatabase } from './integration/database.js';

// The hut is in Europe/Rome: 19:00 on 1 July 2031 is 17:00 UTC (summer time).
const DATE = '2031-07-01';
const TIME = '19:00';
const STARTS_AT = new Date('2031-07-01T17:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
// Well before the slot, so the 2-hour limit of online bookings does not apply.
const DAY_BEFORE = new Date(STARTS_AT.getTime() - 24 * HOUR_MS);

describe('Availability with PostgreSQL (integration) - MH-04', () => {
  const config = loadAppConfig({ ...process.env, JWT_SECRET: 'int-test-secret' });
  const prisma = new PrismaService(config);
  const context = new TransactionContext(prisma);
  const repo = new PrismaBookingsRepository(context);
  const service = new AvailabilityService(repo, config);

  const check = (partySize: number, now = DAY_BEFORE, date = DATE, time = TIME) =>
    service.check({ date, time, partySize }, now);

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('finding the slot', () => {
    it('answers NO_SLOT when no slot includes that date and time', async () => {
      await createSlot(prisma, DATE, TIME, '21:00', [4]);

      const before = await check(2, DAY_BEFORE, DATE, '18:59');
      const otherDate = await check(2, DAY_BEFORE, '2031-07-02', TIME);

      expect(before).toEqual({
        available: false,
        date: DATE,
        time: '18:59',
        partySize: 2,
        reason: 'NO_SLOT',
      });
      expect(otherDate).toMatchObject({ available: false, reason: 'NO_SLOT' });
    });

    it('finds the slot that includes a time after its start, and gives its start and end', async () => {
      await createSlot(prisma, DATE, TIME, '21:00', [4]);

      expect(await check(2, DAY_BEFORE, DATE, '20:34')).toMatchObject({
        available: true,
        time: '20:34',
        slot: { startTime: TIME, endTime: '21:00' },
        totalFreeSeats: 4,
      });
    });

    it('gives the later slot for the time at which two contiguous slots meet', async () => {
      await createSlot(prisma, DATE, '12:00', '13:00', [2]);
      await createSlot(prisma, DATE, '13:00', '14:00', [6]);

      expect(await check(2, DAY_BEFORE, DATE, '12:59')).toMatchObject({
        slot: { startTime: '12:00', endTime: '13:00' },
        totalFreeSeats: 2,
      });
      expect(await check(2, DAY_BEFORE, DATE, '13:00')).toMatchObject({
        slot: { startTime: '13:00', endTime: '14:00' },
        totalFreeSeats: 6,
      });
    });

    it('does not match a slot by its end time', async () => {
      await createSlot(prisma, DATE, '17:00', TIME, [4]);

      expect(await check(2)).toMatchObject({ available: false, reason: 'NO_SLOT' });
    });

    it('reads the date and time of the slot in the time zone of the hut, in summer and in winter', async () => {
      await createSlot(prisma, DATE, TIME, '21:00', [4]);
      await createSlot(prisma, '2031-01-15', TIME, '21:00', [4]);
      // 19:00 in Rome is 17:00 UTC in July and 18:00 UTC in January.
      const oneSecondBefore = (startsAt: string) => new Date(new Date(startsAt).getTime() - 1000);

      const summer = await check(2, oneSecondBefore('2031-07-01T17:00:00.000Z'));
      const winter = await check(2, oneSecondBefore('2031-01-15T18:00:00.000Z'), '2031-01-15');

      // Still found one second before the start: too late to book, but not started.
      expect(summer.reason).toBe('TOO_LATE');
      expect(winter.reason).toBe('TOO_LATE');
    });

    it('answers NO_SLOT from the moment the slot starts, also for a later time in it', async () => {
      await createSlot(prisma, DATE, TIME, '21:00', [4]);

      expect(await check(2, STARTS_AT)).toMatchObject({ available: false, reason: 'NO_SLOT' });
      expect(await check(2, STARTS_AT, DATE, '20:30')).toMatchObject({
        available: false,
        reason: 'NO_SLOT',
      });
      expect(await check(2, new Date(STARTS_AT.getTime() + HOUR_MS))).toMatchObject({
        available: false,
        reason: 'NO_SLOT',
      });
    });

    it('takes the earliest slot when two old overlapping slots include the time', async () => {
      // Possible only for slots created before overlapping slots were forbidden (MH-02).
      await createSlot(prisma, DATE, '19:30', '21:00', [8]);
      await createSlot(prisma, DATE, TIME, '22:00', [2]);

      expect(await check(2, DAY_BEFORE, DATE, '20:00')).toMatchObject({
        slot: { startTime: TIME, endTime: '22:00' },
        totalFreeSeats: 2,
      });
    });

    it('takes the oldest slot when two slots start at the same time', async () => {
      // Possible only for slots created before overlapping slots were forbidden (MH-02).
      await createSlot(prisma, DATE, TIME, '21:00', [2]);
      await createSlot(prisma, DATE, TIME, '22:00', [8]);

      expect(await check(2)).toMatchObject({ available: true, totalFreeSeats: 2 });
    });
  });

  describe('free seats and table layout', () => {
    it('answers the example of the story: a party of 6 on three tables of 2', async () => {
      await createSlot(prisma, DATE, TIME, '21:00', [2, 2, 2]);

      expect(await check(6)).toEqual({
        available: true,
        date: DATE,
        time: TIME,
        partySize: 6,
        slot: { startTime: TIME, endTime: '21:00' },
        totalFreeSeats: 6,
        tables: [
          { tableNumber: 1, seats: 2 },
          { tableNumber: 2, seats: 2 },
          { tableNumber: 3, seats: 2 },
        ],
        breakdown: [2, 2, 2],
        breakdownText: '2 + 2 + 2 seats',
      });
    });

    it('seats a party at one table when one is enough', async () => {
      await createSlot(prisma, DATE, TIME, '21:00', [2, 4, 6]);

      expect(await check(1)).toMatchObject({
        available: true,
        totalFreeSeats: 12,
        tables: [{ tableNumber: 1, seats: 1 }],
        breakdown: [1],
        breakdownText: '1 seat',
      });
    });

    it('subtracts the seats of pending and confirmed bookings, not of rejected ones', async () => {
      const slotId = await createSlot(prisma, DATE, TIME, '21:00', [4, 4, 4]);
      const a = await createHiker(prisma, 'a@example.com');
      const b = await createHiker(prisma, 'b@example.com');
      const c = await createHiker(prisma, 'c@example.com');
      await createBooking(prisma, a.hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 4 },
      ]);
      await createBooking(prisma, b.hikerId, slotId, 'PENDING', [
        { tableNumber: 2, assignedSeats: 3 },
      ]);
      await createBooking(prisma, c.hikerId, slotId, 'REJECTED', [
        { tableNumber: 3, assignedSeats: 4 },
      ]);

      // Table 1 is full, table 2 has 1 seat left, table 3 is free.
      expect(await check(5)).toMatchObject({
        available: true,
        totalFreeSeats: 5,
        tables: [
          { tableNumber: 3, seats: 4 },
          { tableNumber: 2, seats: 1 },
        ],
        breakdownText: '4 + 1 seats',
      });
    });

    it('answers INSUFFICIENT_SEATS with the free seats and no table layout', async () => {
      const slotId = await createSlot(prisma, DATE, TIME, '21:00', [4, 2]);
      const { hikerId } = await createHiker(prisma, 'a@example.com');
      await createBooking(prisma, hikerId, slotId, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 3 },
      ]);

      expect(await check(4)).toEqual({
        available: false,
        date: DATE,
        time: TIME,
        partySize: 4,
        reason: 'INSUFFICIENT_SEATS',
        slot: { startTime: TIME, endTime: '21:00' },
        totalFreeSeats: 3,
      });
    });

    it('answers INSUFFICIENT_SEATS with 0 free seats for a slot without tables', async () => {
      await createSlot(prisma, DATE, TIME, '21:00', []);

      expect(await check(1)).toMatchObject({
        available: false,
        reason: 'INSUFFICIENT_SEATS',
        totalFreeSeats: 0,
      });
    });

    it('counts the seats taken at the same table in an overlapping slot', async () => {
      // Possible only for slots created before overlapping slots were forbidden (MH-02):
      // the two slots share table 1.
      const earlier = await createSlot(prisma, DATE, '18:00', '20:00', [4]);
      await createSlot(prisma, DATE, TIME, '21:00', [4]);
      const { hikerId } = await createHiker(prisma, 'a@example.com');
      await createBooking(prisma, hikerId, earlier, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 3 },
      ]);

      expect(await check(2)).toMatchObject({
        available: false,
        reason: 'INSUFFICIENT_SEATS',
        totalFreeSeats: 1,
      });
    });

    it('does not count the bookings of the other slots of the day', async () => {
      const lunch = await createSlot(prisma, DATE, '12:00', '14:00', [4]);
      await createSlot(prisma, DATE, TIME, '21:00', [4]);
      const { hikerId } = await createHiker(prisma, 'a@example.com');
      await createBooking(prisma, hikerId, lunch, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 4 },
      ]);

      expect(await check(4)).toMatchObject({ available: true, totalFreeSeats: 4 });
    });
  });

  describe('2-hour limit of online bookings', () => {
    it('is available exactly 2 hours before the start', async () => {
      await createSlot(prisma, DATE, TIME, '21:00', [4]);

      const result = await check(2, new Date(STARTS_AT.getTime() - 2 * HOUR_MS));

      expect(result.available).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('answers TOO_LATE under 2 hours, still with the table layout', async () => {
      await createSlot(prisma, DATE, TIME, '21:00', [2, 2, 2]);

      const result = await check(3, new Date(STARTS_AT.getTime() - 2 * HOUR_MS + 1000));

      expect(result).toEqual({
        available: false,
        date: DATE,
        time: TIME,
        partySize: 3,
        reason: 'TOO_LATE',
        slot: { startTime: TIME, endTime: '21:00' },
        totalFreeSeats: 6,
        tables: [
          { tableNumber: 1, seats: 2 },
          { tableNumber: 2, seats: 1 },
        ],
        breakdown: [2, 1],
        breakdownText: '2 + 1 seats',
      });
    });

    it('answers TOO_LATE without a table layout when the party does not fit either', async () => {
      await createSlot(prisma, DATE, TIME, '21:00', [2]);

      const result = await check(3, new Date(STARTS_AT.getTime() - HOUR_MS));

      expect(result).toMatchObject({ available: false, reason: 'TOO_LATE', totalFreeSeats: 2 });
      expect(result.tables).toBeUndefined();
      expect(result.breakdown).toBeUndefined();
    });
  });

  describe('together with bookings', () => {
    const confirmationSender = { send: () => Promise.resolve() } as unknown as ConfirmationSender;
    const uow = new PrismaUnitOfWork(prisma, context);
    const bookings = new BookingsService(uow, repo, confirmationSender, config);

    it('is read-only: a check stores nothing and reserves no seats', async () => {
      await createSlot(prisma, DATE, TIME, '21:00', [4, 2]);

      const first = await check(5);
      const second = await check(5);

      expect(second).toEqual(first);
      expect(await prisma.booking.count()).toBe(0);
      expect(await prisma.bookingTable.count()).toBe(0);
    });

    it('announces the tables that a booking made right after gets', async () => {
      // The slot is in the future for the real clock too: BookingsService.create uses it.
      const slotId = await createSlot(prisma, DATE, TIME, '21:00', [2, 6, 4]);
      const { userId } = await createHiker(prisma, 'a@example.com');

      const announced = await check(7, new Date());
      const booking = await bookings.create(userId, { slotId, partySize: 7 });

      expect(announced.available).toBe(true);
      expect(
        booking.tables.map((t) => ({ tableNumber: t.tableNumber, seats: t.assignedSeats })),
      ).toEqual(announced.tables);
    });

    it('sees the seats taken by a booking and gives them back when it is rejected', async () => {
      const slotId = await createSlot(prisma, DATE, TIME, '21:00', [4]);
      const { userId } = await createHiker(prisma, 'a@example.com');

      const booking = await bookings.create(userId, { slotId, partySize: 3 });
      const afterBooking = await check(2);
      await prisma.booking.update({ where: { id: booking.id }, data: { status: 'REJECTED' } });
      const afterRejection = await check(2);

      expect(afterBooking).toMatchObject({
        available: false,
        reason: 'INSUFFICIENT_SEATS',
        totalFreeSeats: 1,
      });
      expect(afterRejection).toMatchObject({ available: true, totalFreeSeats: 4 });
    });
  });
});
