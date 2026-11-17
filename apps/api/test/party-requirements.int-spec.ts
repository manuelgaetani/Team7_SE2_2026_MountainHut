import { vi } from 'vitest';
import { MAX_REQUIREMENTS_COUNT, MAX_REQUIREMENTS_LENGTH } from '@mountain-hut/shared';
import type { BookingResult, PartyRequirement } from '@mountain-hut/shared';
import { BookingsService } from '../src/bookings/application/bookings.service.js';
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
import { createHiker, createSlot, resetDatabase } from './integration/database.js';

// Keeps the emails instead of sending them.
class FakeMailer extends Mailer {
  sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

const SHELLFISH: PartyRequirement = { allergies: true, description: '1 shellfish allergy' };
const VEGETARIANS: PartyRequirement = { allergies: false, description: '2 vegetarians' };

describe('Party requirements with PostgreSQL (integration) - MH-05', () => {
  const config = loadAppConfig({ ...process.env, JWT_SECRET: 'int-test-secret' });
  const prisma = new PrismaService(config);
  const context = new TransactionContext(prisma);
  const uow = new PrismaUnitOfWork(prisma, context);
  const repo = new PrismaBookingsRepository(context);
  const mailer = new FakeMailer();
  const notifier = new BookingConfirmationAdapter(context, new NotificationService(mailer, prisma));
  const sender = new ConfirmationSender(notifier, repo, new TimerSleeper());
  const service = new BookingsService(uow, repo, sender, config);

  // What the database holds for a booking, in the order the hiker entered it.
  const storedFor = (bookingId: number) =>
    prisma.partyRequirement.findMany({
      where: { bookingId },
      orderBy: { id: 'asc' },
      select: { allergies: true, description: true },
    });

  // The confirmation email is sent after the commit: wait for it, so it does not run into the
  // next test.
  const untilEmailed = (bookingId: number) =>
    vi.waitFor(
      () => {
        const message = mailer.sent.find((m) => m.text.includes(`Booking n.: ${bookingId}`));
        expect(message).toBeDefined();
        return message!;
      },
      { timeout: 3000 },
    );

  beforeEach(async () => {
    await resetDatabase(prisma);
    mailer.sent = [];
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('storage', () => {
    it('keeps the order the hiker entered and returns what was stored', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [6]);
      const requirements: PartyRequirement[] = [
        VEGETARIANS,
        SHELLFISH,
        { allergies: false, description: 'High chair for a child' },
      ];

      const booking = await service.create(anna.userId, { slotId, partySize: 5, requirements });
      await untilEmailed(booking.id);

      expect(booking.requirements).toEqual(requirements);
      expect(await storedFor(booking.id)).toEqual(requirements);
    });

    it(`stores the maximum of ${MAX_REQUIREMENTS_COUNT} requirements, in order`, async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [24]);
      const requirements = Array.from({ length: MAX_REQUIREMENTS_COUNT }, (_, i) => ({
        allergies: i % 2 === 0,
        description: `Need number ${i + 1}`,
      }));

      const booking = await service.create(anna.userId, { slotId, partySize: 20, requirements });
      await untilEmailed(booking.id);

      expect(await storedFor(booking.id)).toEqual(requirements);
    });

    it('stores a description at the length limit and non-ASCII text unchanged', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const requirements: PartyRequirement[] = [
        { allergies: false, description: 'x'.repeat(MAX_REQUIREMENTS_LENGTH) },
        { allergies: true, description: 'Celiachia: niente glutine — 1 bambino 🍝' },
      ];

      const booking = await service.create(anna.userId, { slotId, partySize: 2, requirements });
      await untilEmailed(booking.id);

      expect(await storedFor(booking.id)).toEqual(requirements);
    });

    it('keeps the requirements of each booking apart', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4, 4]);

      const first = await service.create(anna.userId, {
        slotId,
        partySize: 2,
        requirements: [SHELLFISH],
      });
      const second = await service.create(bruno.userId, {
        slotId,
        partySize: 3,
        requirements: [VEGETARIANS],
      });
      await untilEmailed(first.id);
      await untilEmailed(second.id);

      expect(await storedFor(first.id)).toEqual([SHELLFISH]);
      expect(await storedFor(second.id)).toEqual([VEGETARIANS]);
    });

    it('are deleted with their booking, and only theirs', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4, 4]);
      const gone = await service.create(anna.userId, {
        slotId,
        partySize: 2,
        requirements: [SHELLFISH, VEGETARIANS],
      });
      const kept = await service.create(bruno.userId, {
        slotId,
        partySize: 2,
        requirements: [VEGETARIANS],
      });
      await untilEmailed(gone.id);
      await untilEmailed(kept.id);

      // The table assignments and the email records point to the booking without a cascade.
      await prisma.bookingTable.deleteMany({ where: { bookingId: gone.id } });
      await prisma.notification.deleteMany({ where: { bookingId: gone.id } });
      await prisma.booking.delete({ where: { id: gone.id } });

      expect(await storedFor(gone.id)).toEqual([]);
      expect(await storedFor(kept.id)).toEqual([VEGETARIANS]);
    });
  });

  describe('refused bookings leave no requirements behind', () => {
    it('when the seats are not enough', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [2]);

      await expect(
        service.create(anna.userId, { slotId, partySize: 5, requirements: [SHELLFISH] }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      expect(await prisma.partyRequirement.count()).toBe(0);
      expect(await prisma.booking.count()).toBe(0);
    });

    it('when the slot starts in less than two hours', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2020-01-01', '12:00', '13:00', [4]);

      await expect(
        service.create(anna.userId, { slotId, partySize: 2, requirements: [SHELLFISH] }),
      ).rejects.toMatchObject({ code: 'UNPROCESSABLE' });

      expect(await prisma.partyRequirement.count()).toBe(0);
    });

    it('when the slot does not exist', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');

      await expect(
        service.create(anna.userId, { slotId: 999, partySize: 2, requirements: [SHELLFISH] }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });

      expect(await prisma.partyRequirement.count()).toBe(0);
    });

    it('when the user has no hiker profile', async () => {
      const staff = await prisma.user.create({
        data: { email: 'staff@example.test', password: 'not-used', role: 'EMPLOYEE' },
      });
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      await expect(
        service.create(staff.id, { slotId, partySize: 2, requirements: [SHELLFISH] }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      expect(await prisma.partyRequirement.count()).toBe(0);
    });

    it('when the hiker already booked the slot: the first booking keeps its own', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4, 4]);
      const first = await service.create(anna.userId, {
        slotId,
        partySize: 2,
        requirements: [VEGETARIANS],
      });
      await untilEmailed(first.id);

      await expect(
        service.create(anna.userId, { slotId, partySize: 2, requirements: [SHELLFISH] }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      expect(await prisma.partyRequirement.findMany({ select: { description: true } })).toEqual([
        { description: VEGETARIANS.description },
      ]);
    });

    it('when two hikers race for the last seats: only the winner keeps them', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const bruno = await createHiker(prisma, 'bruno@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [2]);

      const results = await Promise.allSettled([
        service.create(anna.userId, { slotId, partySize: 2, requirements: [SHELLFISH] }),
        service.create(bruno.userId, { slotId, partySize: 2, requirements: [VEGETARIANS] }),
      ]);

      const won = results.filter(
        (r): r is PromiseFulfilledResult<BookingResult> => r.status === 'fulfilled',
      );
      const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect(lost[0].reason).toMatchObject({ code: 'CONFLICT' });

      const winner = won[0].value;
      await untilEmailed(winner.id);
      expect(await prisma.partyRequirement.count()).toBe(1);
      expect(await storedFor(winner.id)).toEqual(winner.requirements);
    });
  });

  describe('confirmation email', () => {
    it('lists every requirement read back from the database, marking the allergies', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      const booking = await service.create(anna.userId, {
        slotId,
        partySize: 3,
        requirements: [VEGETARIANS, SHELLFISH],
      });
      const message = await untilEmailed(booking.id);

      expect(message.text).toContain('Requirements: 2 vegetarians');
      expect(message.text).toContain('Allergies (special care needed): 1 shellfish allergy');
      expect(message.text.indexOf('2 vegetarians')).toBeLessThan(
        message.text.indexOf('1 shellfish allergy'),
      );
    });

    it('escapes the descriptions in the HTML version', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      const booking = await service.create(anna.userId, {
        slotId,
        partySize: 2,
        requirements: [{ allergies: false, description: '<b>No onions</b> & no garlic' }],
      });
      const message = await untilEmailed(booking.id);

      expect(message.html).toContain('&lt;b&gt;No onions&lt;/b&gt; &amp; no garlic');
      expect(message.html).not.toContain('<b>No onions</b>');
    });

    it('has no requirements line when there are none', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      const booking = await service.create(anna.userId, { slotId, partySize: 2 });
      const message = await untilEmailed(booking.id);

      expect(message.text).not.toContain('Requirements');
    });
  });
});
