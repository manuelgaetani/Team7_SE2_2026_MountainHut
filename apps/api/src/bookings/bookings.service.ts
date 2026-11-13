import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  BookingResult,
  CreateBookingInput,
  SlotSummary,
  CancelledBooking,
} from '@mountain-hut/shared';
import { bookingTimeZone } from '../common/booking-config.js';
import { NotificationService } from '../notifications/notification.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { decideBooking, slotAvailability } from './booking-policy.js';
import { BookingsRepository } from './bookings.repository.js';
import { decideCancellation } from './booking-cancellation-policy.js';

// Waits before each new attempt to send a failed confirmation email: 1 send + 3 retries.
// The retries live in this process only, so they are lost if the API restarts.
export const CONFIRMATION_RETRY_DELAYS_MS = [1_000, 5_000, 25_000];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: BookingsRepository,
    private readonly notifications: NotificationService,
  ) {}

  async listSlots(): Promise<SlotSummary[]> {
    const now = new Date();
    const slots = await this.repo.findUpcomingSlots(this.prisma, bookingTimeZone(), now);
    return slots.map(({ startsAt, ...slot }) => ({
      ...slot,
      availability: slotAvailability(startsAt, now, slot.freeSeats),
    }));
  }

  // userId è l'hiker che prenota: arriva dal token, mai dal body.
  async create(userId: number, input: CreateBookingInput): Promise<BookingResult> {
    // 1. Tutto in una transazione: o si scrive tutto, o niente.
    const result = await this.prisma.$transaction(async (tx) => {
      // The user booking must have a hiker profile
      const hikerId = await this.repo.findHikerIdByUserId(tx, userId);
      if (!hikerId) throw new ForbiddenException('A hiker profile is required to book a table');
      // 2. Lock the slot and get its start time.
      const startsAt = await this.repo.lockSlotAndGetStart(tx, input.slotId, bookingTimeZone());
      if (!startsAt) throw new NotFoundException('Slot not found');

      // The slot lock also serializes two identical requests sent at the same time.
      if (await this.repo.hasActiveBooking(tx, hikerId, input.slotId)) {
        throw new ConflictException('You already have a booking for this slot');
      }

      // 3. Read available seats and check with the policy if booking is allowed.
      const tables = await this.repo.findFreeSeatsByTable(tx, input.slotId);
      const decision = decideBooking({
        startsAt,
        now: new Date(),
        partySize: input.partySize,
        tables,
      });
      if (!decision.ok) {
        if (decision.reason === 'TOO_LATE') {
          throw new UnprocessableEntityException(
            'Less than 2 hours remaining before the slot starts',
          );
        }
        throw new ConflictException('Insufficient seats available for this slot');
      }

      // 4. Save booking and table assignments.
      const booking = await this.repo.createBooking(tx, {
        hikerId,
        slotId: input.slotId,
        partySize: input.partySize,
        requirements: input.requirements || null,
      });
      await this.repo.createBookingTables(tx, booking.id, input.slotId, decision.allocation);

      return { ...booking, tables: decision.allocation };
    });

    // After the commit and not awaited: a slow SMTP server must not delay the answer.
    void this.sendConfirmation(result.id);
    return result;
  }

  // Cancels a booking of the hiker, at any time. The seat queries ignore cancelled bookings,
  // so the seats are free for other guests as soon as the transaction commits.
  async cancel(userId: number, bookingId: number): Promise<CancelledBooking> {
    return this.prisma.$transaction(async (tx) => {
      const hikerId = await this.repo.findHikerIdByUserId(tx, userId);
      if (!hikerId) throw new ForbiddenException('A hiker profile is required to cancel a booking');

      const booking = await this.repo.lockBooking(tx, bookingId);
      // Someone else's booking looks like a missing one: its id must not be revealed.
      if (!booking || booking.hikerId !== hikerId) {
        throw new NotFoundException('Booking not found');
      }

      const decision = decideCancellation({ status: booking.status });
      if (!decision.ok) {
        throw new ConflictException(
          decision.reason === 'ALREADY_CANCELLED'
            ? 'This booking is already cancelled'
            : 'A rejected booking cannot be cancelled',
        );
      }
      return this.repo.cancelBooking(tx, bookingId);
    });
  }

  // Sends the confirmation email and, once it is sent, confirms the booking.
  // A failed email is retried after each delay of CONFIRMATION_RETRY_DELAYS_MS; after the last
  // failure, or when the hiker has no email, the booking stays PENDING.
  // Never rejects: the booking is already stored, whatever happens to its email.
  private async sendConfirmation(bookingId: number): Promise<void> {
    try {
      const confirmation = await this.repo.findBookingConfirmation(this.prisma, bookingId);
      if (!confirmation) return;

      for (let attempt = 0; ; attempt++) {
        const status = await this.notifications.sendBookingConfirmation(
          confirmation.recipient,
          confirmation.booking,
        );
        if (status === 'SENT') break;
        if (status !== 'FAILED' || attempt >= CONFIRMATION_RETRY_DELAYS_MS.length) return;
        await wait(CONFIRMATION_RETRY_DELAYS_MS[attempt]);
      }

      // Outside the loop: if confirming fails, the email must not be sent again.
      await this.repo.confirmBooking(this.prisma, bookingId);
    } catch (err) {
      this.logger.error(`Confirmation of booking ${bookingId} not completed`, err);
    }
  }
}
