import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { BookingResult, CreateBookingInput, SlotSummary } from '@mountain-hut/shared';
import { bookingTimeZone } from '../common/booking-config.js';
import { NotificationService } from '../notifications/notification.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { decideBooking, slotAvailability } from './booking-policy.js';
import { BookingsRepository } from './bookings.repository.js';

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
      const booking = await this.repo.createConfirmedBooking(tx, {
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

  // Never rejects: the booking is already stored, whatever happens to its email.
  private async sendConfirmation(bookingId: number): Promise<void> {
    try {
      const confirmation = await this.repo.findBookingConfirmation(this.prisma, bookingId);
      if (!confirmation) return;
      await this.notifications.sendBookingConfirmation(
        confirmation.recipient,
        confirmation.booking,
      );
    } catch (err) {
      this.logger.error(`Confirmation of booking ${bookingId} not sent`, err);
    }
  }
}
