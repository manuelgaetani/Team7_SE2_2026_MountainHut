import { Injectable, Logger } from '@nestjs/common';
import type { BookingResult, CreateBookingInput, SlotSummary } from '@mountain-hut/shared';
import { AppConfig } from '../../config/app-config.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { UnitOfWork } from '../../shared-kernel/unit-of-work.js';
import { decideBooking, slotAvailability } from '../domain/booking-policy.js';
import { BookingsRepository } from './bookings.repository.port.js';

// Waits before each new attempt to send a failed confirmation email: 1 send + 3 retries.
// The retries live in this process only, so they are lost if the API restarts.
export const CONFIRMATION_RETRY_DELAYS_MS = [1_000, 5_000, 25_000];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly repo: BookingsRepository,
    private readonly notifications: NotificationService,
    private readonly config: AppConfig,
  ) {}

  async listSlots(): Promise<SlotSummary[]> {
    const now = new Date();
    const slots = await this.repo.findUpcomingSlots(this.config.bookingTimeZone, now);
    return slots.map(({ startsAt, ...slot }) => ({
      ...slot,
      availability: slotAvailability(startsAt, now, slot.freeSeats),
    }));
  }

  // userId è l'hiker che prenota: arriva dal token, mai dal body.
  async create(userId: number, input: CreateBookingInput): Promise<BookingResult> {
    // 1. Tutto in una transazione: o si scrive tutto, o niente.
    const result = await this.uow.run(async () => {
      // The user booking must have a hiker profile
      const hikerId = await this.repo.findHikerIdByUserId(userId);
      if (!hikerId)
        throw new DomainError('FORBIDDEN', 'A hiker profile is required to book a table');
      // 2. Lock the slot and get its start time.
      const startsAt = await this.repo.lockSlotAndGetStart(
        input.slotId,
        this.config.bookingTimeZone,
      );
      if (!startsAt) throw new DomainError('NOT_FOUND', 'Slot not found');

      // The slot lock also serializes two identical requests sent at the same time.
      if (await this.repo.hasActiveBooking(hikerId, input.slotId)) {
        throw new DomainError('CONFLICT', 'You already have a booking for this slot');
      }

      // 3. Read available seats and check with the policy if booking is allowed.
      const tables = await this.repo.findFreeSeatsByTable(input.slotId);
      const decision = decideBooking({
        startsAt,
        now: new Date(),
        partySize: input.partySize,
        tables,
      });
      if (!decision.ok) {
        if (decision.reason === 'TOO_LATE') {
          throw new DomainError(
            'UNPROCESSABLE',
            'Less than 2 hours remaining before the slot starts',
          );
        }
        throw new DomainError('CONFLICT', 'Insufficient seats available for this slot');
      }

      // 4. Save booking and table assignments.
      const booking = await this.repo.createBooking({
        hikerId,
        slotId: input.slotId,
        partySize: input.partySize,
        requirements: input.requirements || null,
      });
      await this.repo.createBookingTables(booking.id, input.slotId, decision.allocation);

      return { ...booking, tables: decision.allocation };
    });

    // After the commit and not awaited: a slow SMTP server must not delay the answer.
    void this.sendConfirmation(result.id);
    return result;
  }

  // Sends the confirmation email and, once it is sent, confirms the booking.
  // A failed email is retried after each delay of CONFIRMATION_RETRY_DELAYS_MS; after the last
  // failure, or when the hiker has no email, the booking stays PENDING.
  // Never rejects: the booking is already stored, whatever happens to its email.
  private async sendConfirmation(bookingId: number): Promise<void> {
    try {
      const confirmation = await this.repo.findBookingConfirmation(bookingId);
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
      await this.repo.confirmBooking(bookingId);
    } catch (err) {
      this.logger.error(`Confirmation of booking ${bookingId} not completed`, err);
    }
  }
}
