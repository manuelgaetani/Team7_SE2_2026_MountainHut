import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { vi } from 'vitest';
import { changeBookingSchema } from '@mountain-hut/shared';
import { BookingsRepository } from '../src/bookings/bookings.repository.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { Mailer } from '../src/notifications/mailer.js';
import type { MailMessage } from '../src/notifications/mailer.js';
import { NotificationService } from '../src/notifications/notification.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createBooking, createHiker, createSlot, resetDatabase } from './integration/database.js';

// MH-06: a hiker changes the slot, the party size or the requirements of a booking.
// Rules: course issues #38 (a party that no longer fits is seated again with the MH-01 rules),
// #41 (every change is notified by email) and #43 (at least 48 hours before the meal, for the
// booked slot and for a new one).

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
  const prisma = new PrismaService();
  const repo = new BookingsRepository();
  const mailer = new FakeMailer();
  const service = new BookingsService(prisma, repo, new NotificationService(mailer, prisma));

  // The emails are sent after the commit and not awaited. Each test waits for its own before the
  // next one empties the database: a late email could otherwise land on a booking of the next test.
  const pending: Promise<unknown>[] = [];
  type Sender = (bookingId: number) => Promise<void>;
  const internals = service as unknown as Record<'sendChange' | 'sendConfirmation', Sender>;
  for (const name of ['sendChange', 'sendConfirmation'] as const) {
    const send = internals[name].bind(service);
    internals[name] = (bookingId) => {
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
  const seatsTakenIn = async (slotId: number): Promise<number> =>
    (await prisma.bookingTable.aggregate({ where: { slotId }, _sum: { assignedSeats: true } }))._sum
      .assignedSeats ?? 0;

  // The state a refused change must not touch.
  const snapshot = async (bookingId: number) => ({
    booking: await bookingOf(bookingId),
    tables: await tablesOf(bookingId),
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

  describe('party size (issue #38)', () => {
    it('keeps the party at its table when the larger party still fits there', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [6, 6]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 2, assignedSeats: 3 },
      ]);

      const result = await service.change(anna.userId, booking, { partySize: 5 });

      expect(result.tables).toEqual([{ tableNumber: 2, assignedSeats: 5 }]);
      expect((await bookingOf(booking)).partySize).toBe(5);
      expect(await tablesOf(booking)).toEqual(['2:5']);
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

      await expect(service.change(anna.userId, booking, { partySize: 6 })).rejects.toBeInstanceOf(
        ConflictException,
      );

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
      ).rejects.toBeInstanceOf(ConflictException);

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

      await expect(service.change(anna.userId, booking, { slotId: dinner })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(await snapshot(booking)).toEqual(before);
    });

    it('refuses to move to a slot that does not exist', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const lunch = await createSlot(prisma, '2031-07-10', '12:00', '14:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, lunch, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await expect(
        service.change(anna.userId, booking, { slotId: 999_999 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect((await bookingOf(booking)).slotId).toBe(lunch);
    });
  });

  describe('requirements', () => {
    it('changes the requirements without touching the tables', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      // Parsed like the controller does: the schema trims the text.
      const input = changeBookingSchema.parse({ requirements: '  no nuts ' });
      const result = await service.change(anna.userId, booking, input);

      expect(result.requirements).toBe('no nuts');
      expect((await bookingOf(booking)).requirements).toBe('no nuts');
      expect(await tablesOf(booking)).toEqual(['1:2']);
    });

    it('removes the requirements', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'CONFIRMED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      await prisma.booking.update({ where: { id: booking }, data: { requirements: 'vegan' } });

      await service.change(anna.userId, booking, { requirements: null });

      expect((await bookingOf(booking)).requirements).toBeNull();
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

      for (const change of [{ partySize: 3 }, { requirements: 'vegan' }, { slotId: later }]) {
        await expect(service.change(anna.userId, booking, change)).rejects.toBeInstanceOf(
          UnprocessableEntityException,
        );
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
      await expect(service.change(anna.userId, booking, { slotId: soon })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(await snapshot(booking)).toEqual(before);
    });
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

      await expect(service.change(bruno.userId, booking, { partySize: 4 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(await snapshot(booking)).toEqual(before);
    });

    it('answers NotFound for a booking that does not exist', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      await expect(service.change(anna.userId, 999_999, { partySize: 2 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses to change a rejected booking', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slot = await createSlot(prisma, '2031-07-10', '19:00', '21:00', [4]);
      const booking = await createBooking(prisma, anna.hikerId, slot, 'REJECTED', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      await expect(service.change(anna.userId, booking, { partySize: 3 })).rejects.toBeInstanceOf(
        ConflictException,
      );
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
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
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

      await service.change(anna.userId, booking, { partySize: 3, requirements: 'vegan' });

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
});
