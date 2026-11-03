import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { vi } from 'vitest';
import { BookingsRepository } from '../../src/bookings/bookings.repository.js';
import {
  BookingsService,
  CONFIRMATION_RETRY_DELAYS_MS,
} from '../../src/bookings/bookings.service.js';
import { Mailer } from '../../src/notifications/mailer.js';
import type { MailMessage } from '../../src/notifications/mailer.js';
import { NotificationService } from '../../src/notifications/notification.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createBooking, createSlot, resetDatabase } from './database.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const WAIT = { timeout: 3000 };

// Adapt it to the date format of templates/booking-confirmation.ts: the year is enough here.
const DATE_IN_EMAIL = /2031/;

// Keeps the emails instead of sending them. It can be told to fail or to wait.
class FakeMailer extends Mailer {
  sent: MailMessage[] = [];
  // How many of the next sends fail.
  failures = 0;
  // While it is set, every send waits for it.
  gate: Promise<void> | null = null;

  async send(message: MailMessage): Promise<void> {
    if (this.gate) await this.gate;
    if (this.failures > 0) {
      this.failures--;
      throw new Error('SMTP down');
    }
    this.sent.push(message);
  }
}

describe('Booking confirmation with PostgreSQL (integration)', () => {
  const prisma = new PrismaService();
  const repo = new BookingsRepository();
  const mailer = new FakeMailer();
  const notifications = new NotificationService(mailer, prisma);
  const service = new BookingsService(prisma, repo, notifications);

  const originalDelays = [...CONFIRMATION_RETRY_DELAYS_MS];

  // A hiker with an account and a name, so each email can be told from the others.
  async function hiker(email: string, fullName: string) {
    const user = await prisma.user.create({
      data: { email, password: 'not-used', hiker: { create: { fullName, phone: '3331234567' } } },
      include: { hiker: true },
    });
    return { userId: user.id, hikerId: user.hiker!.id };
  }

  const statusOf = async (id: number) =>
    (await prisma.booking.findUniqueOrThrow({ where: { id } })).status;
  const attempts = (bookingId: number) =>
    prisma.notification.findMany({ where: { bookingId }, orderBy: { id: 'asc' } });
  const untilConfirmed = (id: number) =>
    vi.waitFor(async () => expect(await statusOf(id)).toBe('CONFIRMED'), WAIT);

  beforeEach(async () => {
    await resetDatabase(prisma);
    mailer.sent = [];
    mailer.failures = 0;
    mailer.gate = null;
    // Short waits between the retries, so the tests do not take 31 seconds each.
    CONFIRMATION_RETRY_DELAYS_MS.splice(0, CONFIRMATION_RETRY_DELAYS_MS.length, 5, 5, 5);
  });

  afterEach(() => {
    CONFIRMATION_RETRY_DELAYS_MS.splice(
      0,
      CONFIRMATION_RETRY_DELAYS_MS.length,
      ...originalDelays,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('the email', () => {
    it('is sent to the hiker with the details of the booking, then the booking is confirmed', async () => {
      const anna = await hiker('anna@example.test', 'Anna Rossi');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      const booking = await service.create(anna.userId, {
        slotId,
        partySize: 3,
        requirements: 'One nut allergy',
      });
      expect(booking.status).toBe('PENDING');
      await untilConfirmed(booking.id);

      expect(mailer.sent).toHaveLength(1);
      const [message] = mailer.sent;
      expect(message.to).toBe('anna@example.test');
      expect(message.subject).toContain(`Booking n. ${booking.id} confirmed`);
      expect(message.text).toContain(`Booking n.: ${booking.id}`);
      expect(message.text).toContain('Name: Anna Rossi');
      expect(message.text).toMatch(DATE_IN_EMAIL);
      expect(message.text).toContain('Time: 19:00 - 21:00');
      expect(message.text).toContain('People: 3 people');
      expect(message.text).toContain('Requirements: One nut allergy');
    });

    it('records the sent email in the notifications', async () => {
      const anna = await hiker('anna@example.test', 'Anna Rossi');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      const booking = await service.create(anna.userId, { slotId, partySize: 2 });
      await untilConfirmed(booking.id);

      const rows = await attempts(booking.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: 'BOOKING_CONFIRMATION',
        recipient: 'anna@example.test',
        subject: mailer.sent[0].subject,
        status: 'SENT',
        error: null,
        userId: anna.userId,
        bookingId: booking.id,
      });
    });

    it('goes to each hiker for their own booking only', async () => {
      const anna = await hiker('anna@example.test', 'Anna Rossi');
      const bruno = await hiker('bruno@example.test', 'Bruno Bianchi');
      const lunch = await createSlot(prisma, '2031-07-01', '12:00', '14:00', [4]);
      const dinner = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      const first = await service.create(anna.userId, { slotId: lunch, partySize: 2 });
      const second = await service.create(bruno.userId, { slotId: dinner, partySize: 3 });
      await untilConfirmed(first.id);
      await untilConfirmed(second.id);

      expect(mailer.sent).toHaveLength(2);
      const toAnna = mailer.sent.find((m) => m.to === 'anna@example.test')!;
      const toBruno = mailer.sent.find((m) => m.to === 'bruno@example.test')!;
      expect(toAnna.text).toContain(`Booking n.: ${first.id}`);
      expect(toAnna.text).toContain('Name: Anna Rossi');
      expect(toAnna.text).not.toContain('Bruno Bianchi');
      expect(toBruno.text).toContain(`Booking n.: ${second.id}`);
      expect(toBruno.text).toContain('Name: Bruno Bianchi');
    });
  });

  describe('status of the booking', () => {
    it('stays PENDING until the email has been sent', async () => {
      const anna = await hiker('anna@example.test', 'Anna Rossi');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      let release!: () => void;
      mailer.gate = new Promise<void>((resolve) => (release = resolve));

      // The answer does not wait for the SMTP server.
      const booking = await service.create(anna.userId, { slotId, partySize: 2 });
      expect(await statusOf(booking.id)).toBe('PENDING');
      expect(mailer.sent).toHaveLength(0);

      release();
      await untilConfirmed(booking.id);
      expect(mailer.sent).toHaveLength(1);
    });

    it('is confirmed by a retry after a failed email, and every attempt is recorded', async () => {
      const anna = await hiker('anna@example.test', 'Anna Rossi');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      mailer.failures = 2;

      const booking = await service.create(anna.userId, { slotId, partySize: 2 });
      await untilConfirmed(booking.id);

      const rows = await attempts(booking.id);
      expect(rows.map((r) => r.status)).toEqual(['FAILED', 'FAILED', 'SENT']);
      expect(rows[0].error).toBe('SMTP down');
      expect(rows[2].error).toBeNull();
      expect(mailer.sent).toHaveLength(1);
    });

    it('stays PENDING when every attempt fails, and stops after the last retry', async () => {
      const anna = await hiker('anna@example.test', 'Anna Rossi');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      mailer.failures = 99;

      // The booking is valid whatever happens to its email.
      const booking = await service.create(anna.userId, { slotId, partySize: 2 });
      expect(booking.status).toBe('PENDING');

      // 1 send + 3 retries.
      await vi.waitFor(async () => expect(await attempts(booking.id)).toHaveLength(4), WAIT);
      await sleep(100);

      expect(await attempts(booking.id)).toHaveLength(4);
      expect(await statusOf(booking.id)).toBe('PENDING');
      expect(mailer.sent).toHaveLength(0);
    });
  });

  describe('refused bookings', () => {
    it('send no email when the seats are not enough', async () => {
      const anna = await hiker('anna@example.test', 'Anna Rossi');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [2]);

      await expect(service.create(anna.userId, { slotId, partySize: 5 })).rejects.toBeInstanceOf(
        ConflictException,
      );
      await sleep(100);

      expect(mailer.sent).toHaveLength(0);
      expect(await prisma.notification.count()).toBe(0);
    });

    it('send no email when the slot starts in less than two hours', async () => {
      const anna = await hiker('anna@example.test', 'Anna Rossi');
      const slotId = await createSlot(prisma, '2020-01-01', '12:00', '13:00', [4]);

      await expect(service.create(anna.userId, { slotId, partySize: 2 })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      await sleep(100);

      expect(mailer.sent).toHaveLength(0);
      expect(await prisma.notification.count()).toBe(0);
    });
  });

  describe('requirements of the party', () => {
    it('are stored with the booking', async () => {
      const anna = await hiker('anna@example.test', 'Anna Rossi');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      const booking = await service.create(anna.userId, {
        slotId,
        partySize: 2,
        requirements: 'Vegetarian',
      });

      const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(stored.requirements).toBe('Vegetarian');
    });

    it.each([undefined, ''])('are stored as null when they are %j', async (requirements) => {
      const anna = await hiker('anna@example.test', 'Anna Rossi');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      const booking = await service.create(anna.userId, { slotId, partySize: 2, requirements });

      const stored = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(stored.requirements).toBeNull();
    });
  });

  describe('findBookingConfirmation', () => {
    it('returns null for a booking that does not exist', async () => {
      await expect(repo.findBookingConfirmation(prisma, 999)).resolves.toBeNull();
    });

    it('returns the account and the email of the hiker who booked', async () => {
      const anna = await hiker('anna@example.test', 'Anna Rossi');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const bookingId = await createBooking(prisma, anna.hikerId, slotId, 'PENDING', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      const confirmation = await repo.findBookingConfirmation(prisma, bookingId);
      expect(confirmation?.recipient).toMatchObject({
        userId: anna.userId,
        email: 'anna@example.test',
      });
      expect(confirmation?.booking).toMatchObject({ bookingId });
    });

    it('returns no email for a hiker without an account', async () => {
      const walkIn = await prisma.hiker.create({
        data: { fullName: 'Walk In', phone: '3330000000' },
      });
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const bookingId = await createBooking(prisma, walkIn.id, slotId, 'PENDING', [
        { tableNumber: 1, assignedSeats: 2 },
      ]);

      const confirmation = await repo.findBookingConfirmation(prisma, bookingId);
      expect(confirmation?.recipient).toMatchObject({ userId: null, email: null });
    });
  });
});