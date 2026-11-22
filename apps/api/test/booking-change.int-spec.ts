import { vi } from 'vitest';
import { changeBookingSchema } from '@mountain-hut/shared';
import { BookingsService } from '../src/bookings/application/bookings.service.js';
import { ListMyBookings } from '../src/bookings/application/list-my-bookings.js';
import {
  ConfirmationSender,
  TimerSleeper,
} from '../src/bookings/application/confirmation-sender.js';
import { PrismaBookingsRepository } from '../src/bookings/infrastructure/prisma-bookings.repository.js';
import { loadAppConfig } from '../src/config/app-config.js';
import { PrismaUnitOfWork } from '../src/infrastructure/prisma/prisma-unit-of-work.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../src/infrastructure/prisma/transaction-context.js';
import { BookingConfirmationAdapter } from '../src/notifications/infrastructure/booking-confirmation.adapter.js';
import { Mailer } from '../src/notifications/mailer.js';
import type { MailMessage } from '../src/notifications/mailer.js';
import { NotificationService } from '../src/notifications/notification.service.js';
import { createBooking, createHiker, createSlot, resetDatabase } from './integration/database.js';

// MH-06: a hiker changes the slot, the party size or the requirements of a booking.
// Rules: course issues #38 and #48 (every change is treated as a new booking: the seats of the
// booking are released and the tables are assigned again with the MH-01 rules, even when the party
// still fits at its tables or only the requirements change), #41 (every change is notified by
// email) and #43 (at least 48 hours before the meal, for the booked slot and for a new one).

// Keeps the emails instead of sending them; it can be told to fail.
class FakeMailer extends Mailer {
  sent: MailMessage[] = [];
  failing = false;

  async send(message: MailMessage): Promise<void> {
    if (this.failing) throw new Error('SMTP down');
    this.sent.push(message);
  }
}

const WAIT = { timeout: 3000 };

// The integration tests run with BOOKING_TIMEZONE=Europe/Rome (UTC+2 in July). Unless a test sets
// another time, "now" is 2031-07-01 10:00 in Rome, days before every slot used here.
const NOW = new Date('2031-07-01T08:00:00Z');

describe('Change a booking with PostgreSQL (integration) - MH-06', () => {
  const config = loadAppConfig({ ...process.env, JWT_SECRET: 'int-test-secret' });
  const prisma = new PrismaService(config);
  const context = new TransactionContext(prisma);
  const uow = new PrismaUnitOfWork(prisma, context);
  const repo = new PrismaBookingsRepository(context);
  const mailer = new FakeMailer();
  const notifier = new BookingConfirmationAdapter(context, new NotificationService(mailer, prisma));
  const sender = new ConfirmationSender(notifier, repo, new TimerSleeper());
  const service = new BookingsService(uow, repo, sender, config);
  const myBookings = new ListMyBookings(repo, config);

  // The emails are sent after the commit and not awaited. Each test waits for its own before the
  // next one empties the database: a late email could otherwise land on a booking of the next test.
  const pending: Promise<unknown>[] = [];
  for (const name of ['send', 'sendChange'] as const) {
    const send = sender[name].bind(sender);
    sender[name] = (bookingId) => {
      const sending = send(bookingId);
      pending.push(sending);
      return sending;
    };
  }

  // Table assignments of a booking, as "table:seats".
  const tablesOf = async (bookingId: number): Promise<string[]> =>
    (
      await prisma.bookingTable.findMany({ where: { bookingId }, orderBy: { tableNumber: 'asc' } })
    ).map((t) => `${t.tableNumber}:${t.assignedSeats}`);
  const bookingOf = (id: number) => prisma.booking.findUniqueOrThrow({ where: { id } });
  // The requirements of a booking (MH-05 list), in the order they were entered.
  const needsOf = (bookingId: number) =>
    prisma.partyRequirement.findMany({
      where: { bookingId },
      orderBy: { id: 'asc' },
      select: { allergies: true, description: true },
    });
  const vegan = { allergies: false, description: 'vegan' };
  const seatsTakenIn = async (slotId: number): Promise<number> =>
    (await prisma.bookingTable.aggregate({ where: { slotId }, _sum: { assignedSeats: true } }))._sum
      .assignedSeats ?? 0;

  // The state a refused change must not touch.
  const snapshot = async (bookingId: number) => ({
    booking: await bookingOf(bookingId),
    tables: await tablesOf(bookingId),
    requirements: await needsOf(bookingId),
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    mailer.sent = [];
    mailer.failing = false;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(async () => {
    await Promise.allSettled(pending.splice(0));
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('party size (issues #38 and #48)', () => {
    it('seats a larger party again with the MH-01 rules even when it still fits at its table', async () => {
      // Table 2 (8 seats) could hold the 5 people, but as a new booking the smallest table that
      // fits is table 1 (6 seats).
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [6, 8]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 2, assignedSeats: 3 },
      ]);

      const result = await service.change(anna.userId, booking, { partySize: 5 });

      expect(result.tables).toEqual([{ tableNumber: 1, assignedSeats: 5 }]);
      expect((await bookingOf(booking)).partySize).toBe(5);
      expect(await tablesOf(booking)).toEqual(['1:5']);
      expect(await seatsTakenIn(slot)).toBe(5);
    });

    it('moves a smaller party to the smallest table that fits it', async () => {
      // The example of issue #48: a party of 4 alone at a 4-seat table becomes a party of 2, and a
      // 2-seat table is free in the same slot.
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4, 2]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 4 },
      ]);

      await service.change(anna.userId, booking, { partySize: 2 });

      expect(await tablesOf(booking)).toEqual(['2:2']);
      expect(await seatsTakenIn(slot)).toBe(2);
    });

    it('seats a party that was split again at a single table when it becomes smaller', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4, 4, 2]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 4 },
        { tableNumber: 2, assignedSeats: 4 },
      ]);

      await service.change(anna.userId, booking, { partySize: 2 });

      expect(await tablesOf(booking)).toEqual(['3:2']);
    });

    it('assigns the tables again when the same party size is sent', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4, 2]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await service.change(anna.userId, booking, { partySize: 2 });

      expect(await tablesOf(booking)).toEqual(['2:2']);
    });

    it('seats the party again with the MH-01 rules when it no longer fits at its tables', async () => {
      // The example of issue #38: a party of 4 shares table 1 (6 seats) with a party of 2, so the
      // table is full; the party grows to 6 and table 3 has 6 free seats.
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [6, 2, 6]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 4 },
      ]);
      const other = await createBooking(prisma, bruno.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await service.change(anna.userId, booking, { partySize: 6 });

      expect(await tablesOf(booking)).toEqual(['3:6']);
      expect(await tablesOf(other)).toEqual(['1:2']);
      expect(await seatsTakenIn(slot)).toBe(8);
    });

    it('refuses a larger party without enough seats, leaving the booking as it was', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4, 4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 3 },
      ]);
      await createBooking(prisma, bruno.hikerId, slot, 'PENDING', [
        { tableNumber: 2, assignedSeats: 3 },
      ]);
      const before = await snapshot(booking);

      await expect(service.change(anna.userId, booking, { partySize: 6 })).rejects.toMatchObject({
        code: 'CONFLICT',
      });

      expect(await snapshot(booking)).toEqual(before);
      expect(mailer.sent).toEqual([]);
    });

    it('frees the seats left by a smaller party for the other hikers', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [6]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 6 },
      ]);
      await expect(
        service.create(bruno.userId, { slotId: slot, partySize: 2 }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      await service.change(anna.userId, booking, { partySize: 4 });

      await expect(
        service.create(bruno.userId, { slotId: slot, partySize: 2 }),
      ).resolves.toMatchObject({ tables: [{ tableNumber: 1, assignedSeats: 2 }] });
      expect(await seatsTakenIn(slot)).toBe(6);
    });
  });

  describe('date and time', () => {
    it('moves the booking to another slot, freeing the seats of the old one', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const lunch = await createSlot(prisma, '2031-07-10', '12:00', '14:00', [4]);
      const dinner = await createSlot(prisma, '2031-07-11', '19:00', '21:00', [2, 4]);
      const booking = await createBooking(prisma, anna.hikerId, lunch, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 3 },
      ]);

      const result = await service.change(anna.userId, booking, { slotId: dinner });

      expect(result).toMatchObject({ slotId: dinner, partySize: 3 });
      expect((await bookingOf(booking)).slotId).toBe(dinner);
      expect(await tablesOf(booking)).toEqual(['2:3']);
      expect(await seatsTakenIn(lunch)).toBe(0);
      expect(await seatsTakenIn(dinner)).toBe(3);
    });

    it('moves the booking and changes the party size in one change', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const lunch = await createSlot(prisma, '2031-07-10', '12:00', '14:00', [4]);
      const dinner = await createSlot(prisma, '2031-07-11', '19:00', '21:00', [4, 4]);
      const booking = await createBooking(prisma, anna.hikerId, lunch, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await service.change(anna.userId, booking, { slotId: dinner, partySize: 7 });

      expect(await bookingOf(booking)).toMatchObject({ slotId: dinner, partySize: 7 });
      expect(await tablesOf(booking)).toEqual(['1:4', '2:3']);
    });

    it('refuses to move to a slot where the hiker already has a booking', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const lunch = await createSlot(prisma, '2031-07-10', '12:00', '14:00', [4]);
      const dinner = await createSlot(prisma, '2031-07-11', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, lunch, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      await createBooking(prisma, anna.hikerId, dinner, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      const before = await snapshot(booking);

      await expect(service.change(anna.userId, booking, { slotId: dinner })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(await snapshot(booking)).toEqual(before);
    });

    it('refuses to move to a slot that does not exist', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const lunch = await createSlot(prisma, '2031-07-10', '12:00', '14:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, lunch, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await expect(service.change(anna.userId, booking, { slotId: 999_999 })).rejects.toMatchObject(
        { code: 'NOT_FOUND' },
      );
      expect((await bookingOf(booking)).slotId).toBe(lunch);
    });
  });

  describe('requirements', () => {
    it('changes the requirements and assigns the tables again with the MH-01 rules', async () => {
      // Issue #48: a change of the requirements alone is a change too.
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4, 2]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      // Parsed like the controller does: the schema trims the text.
      const input = changeBookingSchema.parse({
        requirements: [{ allergies: true, description: '  no nuts ' }],
      });
      const result = await service.change(anna.userId, booking, input);

      const noNuts = [{ allergies: true, description: 'no nuts' }];
      expect(result.requirements).toEqual(noNuts);
      expect(await needsOf(booking)).toEqual(noNuts);
      expect(await tablesOf(booking)).toEqual(['2:2']);
      expect(await seatsTakenIn(slot)).toBe(2);
    });

    it('removes the requirements', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      await prisma.partyRequirement.create({ data: { bookingId: booking, ...vegan } });

      await service.change(anna.userId, booking, { requirements: [] });

      expect(await needsOf(booking)).toEqual([]);
    });

    it('keeps the requirements, in order, when only the slot and the party size change', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const lunch = await createSlot(prisma, '2031-07-10', '12:00', '14:00', [4]);
      const dinner = await createSlot(prisma, '2031-07-11', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, lunch, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      const needs = [{ allergies: true, description: 'gluten' }, vegan];
      await prisma.partyRequirement.createMany({
        data: needs.map((n) => ({ bookingId: booking, ...n })),
      });

      const result = await service.change(anna.userId, booking, { slotId: dinner, partySize: 3 });

      expect(result.requirements).toEqual(needs);
      expect(await needsOf(booking)).toEqual(needs);
    });

    it('replaces the whole list with the one sent, in the order it was sent', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      await prisma.partyRequirement.create({ data: { bookingId: booking, ...vegan } });
      const sent = [
        { allergies: false, description: 'vegetarian' },
        { allergies: true, description: 'peanuts' },
        { allergies: false, description: 'high chair' },
      ];

      await service.change(anna.userId, booking, { requirements: sent });

      expect(await needsOf(booking)).toEqual(sent);
    });

    it('does not touch the requirements of the other bookings', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4, 4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      const other = await createBooking(prisma, bruno.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 2, assignedSeats: 2 },
      ]);
      await prisma.partyRequirement.create({ data: { bookingId: other, ...vegan } });

      await service.change(anna.userId, booking, { requirements: [] });

      expect(await needsOf(other)).toEqual([vegan]);
    });
  });

  // The dinner of 2031-07-10 starts at 19:00 in Rome, 17:00 UTC: 48 hours before is
  // 2031-07-08 17:00 UTC.
  describe('48 hours before the meal (issue #43)', () => {
    it('admits a change exactly 48 hours before the booked slot', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      vi.setSystemTime(new Date('2031-07-08T17:00:00Z'));

      await service.change(anna.userId, booking, { partySize: 3 });

      expect((await bookingOf(booking)).partySize).toBe(3);
    });

    it('refuses a change less than 48 hours before the booked slot, changing nothing', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
      const later = await createSlot(prisma, '2031-07-20', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      const before = await snapshot(booking);
      vi.setSystemTime(new Date('2031-07-08T17:00:01Z'));

      for (const change of [{ partySize: 3 }, { requirements: [vegan] }, { slotId: later }]) {
        await expect(service.change(anna.userId, booking, change)).rejects.toMatchObject({
          code: 'UNPROCESSABLE',
        });
      }
      expect(await snapshot(booking)).toEqual(before);
    });

    // Issue #43: the rule applies to the new slot too. The current code only asks the new slot
    // to start in 2 hours or more (MH-01), so this test fails until the service is fixed.
    it('refuses to move the booking to a slot that starts in less than 48 hours', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const booked = await createSlot(prisma, '2031-07-20', '19:00', '21:00', [4]);
      const soon = await createSlot(prisma, '2031-07-02', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, booked, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      const before = await snapshot(booking);

      // 2031-07-02 19:00 in Rome is 33 hours after NOW: more than 2 hours, less than 48.
      await expect(service.change(anna.userId, booking, { slotId: soon })).rejects.toMatchObject({
        code: 'UNPROCESSABLE',
      });
      expect(await snapshot(booking)).toEqual(before);
    });
  });

  describe('status of the booking', () => {
    it.each(['PENDING', 'CONFIRMED'] as const)(
      'keeps a %s booking in the same status',
      async (status) => {
        const anna = await createHiker(prisma, 'anna@example.test');
        const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
        const booking = await createBooking(prisma, anna.hikerId, slot, status, [
          { tableNumber: 1, assignedSeats: 2 },
        ]);

        const result = await service.change(anna.userId, booking, { partySize: 3 });

        expect(result.status).toBe(status);
        expect((await bookingOf(booking)).status).toBe(status);
      },
    );
  });

  describe('whose booking', () => {
    it('refuses to change the booking of another hiker, changing nothing', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      const before = await snapshot(booking);

      await expect(service.change(bruno.userId, booking, { partySize: 4 })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(await snapshot(booking)).toEqual(before);
    });

    it('answers NotFound for a booking that does not exist', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      await expect(service.change(anna.userId, 999_999, { partySize: 2 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('refuses to change a rejected booking', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'REJECTED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await expect(service.change(anna.userId, booking, { partySize: 3 })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect((await bookingOf(booking)).partySize).toBe(2);
    });
  });

  describe('changes at the same time', () => {
    it('lets only one of two larger parties take the last seats, without overbooking', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [6]);
      const a = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      const b = await createBooking(prisma, bruno.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      // 2 free seats: each change asks for both.
      const results = await Promise.allSettled([
        service.change(anna.userId, a, { partySize: 4 }),
        service.change(bruno.userId, b, { partySize: 4 }),
      ]);

      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ code: 'CONFLICT' });
      expect(await seatsTakenIn(slot)).toBe(6);
    });

    it('does not let a change and a new booking take the same last seats', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
      const a = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      const results = await Promise.allSettled([
        service.change(anna.userId, a, { partySize: 4 }),
        service.create(bruno.userId, { slotId: slot, partySize: 2 }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await seatsTakenIn(slot)).toBe(4);
    });

    it('runs two changes of the same booking one after the other', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4, 6]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      const results = await Promise.allSettled([
        service.change(anna.userId, booking, { partySize: 5 }),
        service.change(anna.userId, booking, { partySize: 3 }),
      ]);

      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      // Whichever ran last, the tables match the stored party size.
      const { partySize } = await bookingOf(booking);
      expect(await seatsTakenIn(slot)).toBe(partySize);
    });

    it('never deadlocks when two bookings swap their slots at the same time', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      for (let round = 0; round < 5; round++) {
        await Promise.allSettled(pending.splice(0));
        await prisma.$executeRaw`TRUNCATE booking_tables, bookings, slot_tables, slots RESTART IDENTITY CASCADE`;
        const lunch = await createSlot(prisma, '2031-07-10', '12:00', '14:00', [4]);
        const dinner = await createSlot(prisma, '2031-07-11', '19:00', '21:00', [4]);
        const a = await createBooking(prisma, anna.hikerId, lunch, 'CONFIRMED', [
          { tableNumber: 1, assignedSeats: 2 },
        ]);
        const b = await createBooking(prisma, bruno.hikerId, dinner, 'CONFIRMED', [
          { tableNumber: 1, assignedSeats: 2 },
        ]);

        const results = await Promise.allSettled([
          service.change(anna.userId, a, { slotId: dinner }),
          service.change(bruno.userId, b, { slotId: lunch }),
        ]);

        expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
        expect(await seatsTakenIn(lunch)).toBe(2);
        expect(await seatsTakenIn(dinner)).toBe(2);
      }
    }, 30_000);
  });

  describe('email (issue #41)', () => {
    it('emails the new details of the booking and records it as a change', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await service.change(anna.userId, booking, { partySize: 3, requirements: [vegan] });

      await vi.waitFor(() => expect(mailer.sent).toHaveLength(1), WAIT);
      const [email] = mailer.sent;
      expect(email.to).toBe('anna@example.test');
      expect(email.subject).toMatch(new RegExp(`^Booking n. ${booking} changed - `));
      expect(email.text).toContain('3 people');
      expect(email.text).toContain('vegan');
      expect(
        await prisma.notification.findMany({
          where: { bookingId: booking },
          select: { type: true, status: true },
        }),
      ).toEqual([{ type: 'BOOKING_CHANGE', status: 'SENT' }]);
    });

    it('keeps the change when the email fails, recording the failure', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      mailer.failing = true;

      await service.change(anna.userId, booking, { partySize: 3 });

      await vi.waitFor(
        async () =>
          expect(await prisma.notification.findMany({ where: { bookingId: booking } })).toEqual([
            expect.objectContaining({ type: 'BOOKING_CHANGE', status: 'FAILED' }),
          ]),
        WAIT,
      );
      expect((await bookingOf(booking)).partySize).toBe(3);
    });

    it('sends no email when the change is refused', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [2]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await expect(service.change(anna.userId, booking, { partySize: 3 })).rejects.toThrow();

      expect(mailer.sent).toEqual([]);
      expect(await prisma.notification.count()).toBe(0);
    });
  });

  it('rolls back the whole change when writing the new tables fails', async () => {
    const anna = await createHiker(prisma, 'anna@example.test');
    const lunch = await createSlot(prisma, '2031-07-10', '12:00', '14:00', [4]);
    const dinner = await createSlot(prisma, '2031-07-11', '19:00', '21:00', [4]);
    const booking = await createBooking(prisma, anna.hikerId, lunch, 'CONFIRMED', [
      { tableNumber: 1, assignedSeats: 2 },
    ]);
    const before = await snapshot(booking);
    vi.spyOn(repo, 'createBookingTables').mockRejectedValueOnce(new Error('database down'));

    await expect(
      service.change(anna.userId, booking, { slotId: dinner, partySize: 3 }),
    ).rejects.toThrow('database down');

    // The old tables, deleted before the failure, are back with the old slot and size.
    expect(await snapshot(booking)).toEqual(before);
    expect(mailer.sent).toEqual([]);
  });

  it('rolls back the whole change when writing the new requirements fails', async () => {
    // The requirements are written last, after the new tables.
    const anna = await createHiker(prisma, 'anna@example.test');
    const lunch = await createSlot(prisma, '2031-07-10', '12:00', '14:00', [4]);
    const dinner = await createSlot(prisma, '2031-07-11', '19:00', '21:00', [4]);
    const booking = await createBooking(prisma, anna.hikerId, lunch, 'CONFIRMED', [
      { tableNumber: 1, assignedSeats: 2 },
    ]);
    await prisma.partyRequirement.create({ data: { bookingId: booking, ...vegan } });
    const before = await snapshot(booking);
    vi.spyOn(repo, 'replaceRequirements').mockRejectedValueOnce(new Error('database down'));

    await expect(
      service.change(anna.userId, booking, {
        slotId: dinner,
        partySize: 3,
        requirements: [{ allergies: true, description: 'peanuts' }],
      }),
    ).rejects.toThrow('database down');

    expect(await snapshot(booking)).toEqual(before);
    expect(await seatsTakenIn(dinner)).toBe(0);
    expect(mailer.sent).toEqual([]);
  });

  // GET /api/bookings/me: the list the hiker changes a booking from (web app, MH-06).
  describe('upcoming bookings of the hiker', () => {
    it('lists only the bookings of the hiker, with slot, party and requirements', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4, 4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'PENDING', [
        { tableNumber: 1, assignedSeats: 3 },
      ]);
      await createBooking(prisma, bruno.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 2, assignedSeats: 2 },
      ]);
      const needs = [{ allergies: true, description: 'gluten' }, vegan];
      await prisma.partyRequirement.createMany({
        data: needs.map((n) => ({ bookingId: booking, ...n })),
      });

      await expect(myBookings.execute(anna.userId, NOW)).resolves.toEqual([
        {
          id: booking,
          slotId: slot,
          date: '2031-07-10',
          startTime: '19:00',
          endTime: '21:00',
          partySize: 3,
          requirements: needs,
          status: 'PENDING',
        },
      ]);
    });

    it('gives an empty list of requirements to a booking without any', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
      await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      const [listed] = await myBookings.execute(anna.userId, NOW);

      expect(listed.requirements).toEqual([]);
    });

    it('lists the slots that have not started yet, the soonest first', async () => {
      // NOW is 2031-07-01 10:00 in Rome.
      const anna = await createHiker(prisma, 'anna@example.test');
      const seat = [{ tableNumber: 1, assignedSeats: 1 }];
      const ids: Record<string, number> = {};
      for (const [name, date, start, end] of [
        ['later day', '2031-07-02', '12:00', '13:00'],
        ['over', '2031-07-01', '08:00', '09:00'],
        ['started', '2031-07-01', '09:30', '11:00'],
        ['starts now', '2031-07-01', '10:00', '11:00'],
        ['evening', '2031-07-01', '19:00', '21:00'],
        ['in a minute', '2031-07-01', '10:01', '11:00'],
      ] as const) {
        const slot = await createSlot(prisma, date, start, end, [4]);
        ids[name] = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', seat);
      }

      const listed = await myBookings.execute(anna.userId, NOW);

      expect(listed.map((b) => b.id)).toEqual([
        ids['in a minute'],
        ids['evening'],
        ids['later day'],
      ]);
    });

    it('shows the new slot, party and requirements once a booking is changed', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const lunch = await createSlot(prisma, '2031-07-10', '12:00', '14:00', [4]);
      const dinner = await createSlot(prisma, '2031-07-11', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, lunch, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await service.change(anna.userId, booking, {
        slotId: dinner,
        partySize: 4,
        requirements: [vegan],
      });

      await expect(myBookings.execute(anna.userId, NOW)).resolves.toEqual([
        expect.objectContaining({
          id: booking,
          slotId: dinner,
          date: '2031-07-11',
          startTime: '19:00',
          partySize: 4,
          requirements: [vegan],
        }),
      ]);
    });

    it('refuses an account without a hiker profile', async () => {
      const staff = await prisma.user.create({
        data: { email: 'staff@example.test', password: 'not-used', role: 'EMPLOYEE' },
      });

      await expect(myBookings.execute(staff.id, NOW)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });
});
