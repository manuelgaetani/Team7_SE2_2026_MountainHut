import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { BookingResult, CreateBookingInput } from '@mountain-hut/shared';
import { bookingTimeZone } from '../common/booking-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { decideBooking } from './booking-policy.js';
import { BookingsRepository } from './bookings.repository.js';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: BookingsRepository,
  ) {}

  // userId è l'hiker che prenota: arriva dal token, mai dal body.
  async create(userId: number, input: CreateBookingInput): Promise<BookingResult> {
    // 1. Tutto in una transazione: o si scrive tutto, o niente.
    return this.prisma.$transaction(async (tx) => {
      // The user booking must have a hiker profile
      const hikerId = await this.repo.findHikerIdByUserId(tx, userId);
      if (!hikerId) throw new ForbiddenException('A hiker profile is required to book a table');
      // 2. Lock the slot and get its start time.
      const startsAt = await this.repo.lockSlotAndGetStart(tx, input.slotId, bookingTimeZone());
      if (!startsAt) throw new NotFoundException('Slot not found');

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
          throw new UnprocessableEntityException('Less than 2 hours remaining before the slot starts');
        }
        throw new ConflictException('Insufficient seats available for this slot');
      }

      // 4. Save booking and table assignments.
      const booking = await this.repo.createConfirmedBooking(tx, {
        hikerId,
        slotId: input.slotId,
        partySize: input.partySize,
      });
      await this.repo.createBookingTables(tx, booking.id, input.slotId, decision.allocation);

      return { ...booking, tables: decision.allocation };
    });
  }
}