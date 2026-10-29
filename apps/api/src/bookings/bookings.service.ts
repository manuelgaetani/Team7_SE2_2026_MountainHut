import {
  ConflictException,
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
      // 2. Blocca lo slot e leggi quando inizia.
      const startsAt = await this.repo.lockSlotAndGetStart(tx, input.slotId, bookingTimeZone());
      if (!startsAt) throw new NotFoundException('Slot non trovato');

      // 3. Leggi i posti liberi e chiedi alla policy se si può prenotare.
      const tables = await this.repo.findFreeSeatsByTable(tx, input.slotId);
      const decision = decideBooking({
        startsAt,
        now: new Date(),
        partySize: input.partySize,
        tables,
      });
      if (!decision.ok) {
        if (decision.reason === 'TOO_LATE') {
          throw new UnprocessableEntityException('Mancano meno di 2 ore allo slot');
        }
        throw new ConflictException('Posti insufficienti per questo slot');
      }

      // 4. Scrivi prenotazione e assegnazione dei tavoli.
      const booking = await this.repo.createConfirmedBooking(tx, {
        userId,
        slotId: input.slotId,
        partySize: input.partySize,
      });
      await this.repo.createBookingTables(tx, booking.id, input.slotId, decision.allocation);

      return { ...booking, tables: decision.allocation };
    });
  }
}