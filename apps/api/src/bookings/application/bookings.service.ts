import { Injectable } from '@nestjs/common';
import type { BookingResult, CreateBookingInput } from '@mountain-hut/shared';
import { AppConfig } from '../../config/app-config.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { UnitOfWork } from '../../shared-kernel/unit-of-work.js';
import { decideBooking } from '../domain/booking-policy.js';
import { BookingsRepository } from './bookings.repository.port.js';
import { ConfirmationSender } from './confirmation-sender.js';

@Injectable()
export class BookingsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly repo: BookingsRepository,
    private readonly confirmationSender: ConfirmationSender,
    private readonly config: AppConfig,
  ) {}

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
    void this.confirmationSender.send(result.id);
    return result;
  }
}
