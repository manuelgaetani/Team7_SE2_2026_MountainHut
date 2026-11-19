import { Injectable } from '@nestjs/common';
import type { BookingResult, ChangeBookingInput, CreateBookingInput } from '@mountain-hut/shared';
import { AppConfig } from '../../config/app-config.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { UnitOfWork } from '../../shared-kernel/unit-of-work.js';
import { isChangeAdmitted } from '../domain/booking-change-cutoff.js';
import { decideBooking, isBookableInTime } from '../domain/booking-policy.js';
import { canAccommodatePartyChange } from '../domain/change-seat-allocation.js';
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

      // 4. Save booking, party requirements and table assignments.
      const requirements = input.requirements ?? [];
      const booking = await this.repo.createBooking({
        hikerId,
        slotId: input.slotId,
        partySize: input.partySize,
        requirements,
      });
      await this.repo.createBookingTables(booking.id, input.slotId, decision.allocation);

      return { ...booking, tables: decision.allocation, requirements };
    });

    // After the commit and not awaited: a slow SMTP server must not delay the answer.
    void this.confirmationSender.send(result.id);
    return result;
  }

  // Changes the slot, the party size or the requirements of a booking of the logged-in hiker.
  // Allowed up to 48 hours before the booked slot; a new slot must start in 2 hours or more.
  async change(
    userId: number,
    bookingId: number,
    input: ChangeBookingInput,
  ): Promise<BookingResult> {
    const result = await this.uow.run(async () => {
      const hikerId = await this.repo.findHikerIdByUserId(userId);
      if (!hikerId) throw new DomainError('FORBIDDEN', 'You can only change your own bookings');

      const booking = await this.repo.lockBooking(bookingId);
      if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
      if (booking.hikerId !== hikerId) {
        throw new DomainError('FORBIDDEN', 'You can only change your own bookings');
      }
      if (booking.status === 'REJECTED') {
        throw new DomainError('CONFLICT', 'A rejected booking cannot be changed');
      }

      const slotId = input.slotId ?? booking.slotId;
      const partySize = input.partySize ?? booking.partySize;
      const movesSlot = slotId !== booking.slotId;

      const starts = await this.lockSlots([booking.slotId, slotId]);
      const now = new Date();
      if (!isChangeAdmitted(starts.get(booking.slotId)!, now)) {
        throw new DomainError(
          'UNPROCESSABLE',
          'Changes are only admitted up to 48 hours before the booked date',
        );
      }
      if (movesSlot) {
        const targetStart = starts.get(slotId);
        if (!targetStart) throw new DomainError('NOT_FOUND', 'Target slot not found');
        if (!isBookableInTime(targetStart, now)) {
          throw new DomainError(
            'UNPROCESSABLE',
            'Less than 2 hours remaining before the slot starts',
          );
        }
        if (await this.repo.hasActiveBooking(hikerId, slotId)) {
          throw new DomainError('CONFLICT', 'You already have a booking for this slot');
        }
      }

      const current = await this.repo.findBookingTables(booking.id);
      let tables = current;
      if (movesSlot || partySize !== booking.partySize) {
        const free = await this.repo.findFreeSeatsByTable(slotId, booking.id);
        const allocation = canAccommodatePartyChange(free, partySize, movesSlot ? [] : current);
        if (!allocation) {
          throw new DomainError('CONFLICT', 'Insufficient seats available for the updated booking');
        }
        tables = allocation;
      }

      // The old assignments go first: they point to the booking with its old slot.
      await this.repo.deleteBookingTables(booking.id);
      const stored = await this.repo.updateBooking(booking.id, { slotId, partySize });
      await this.repo.createBookingTables(booking.id, slotId, tables);

      // A list sent by the hiker replaces the old one as a whole (MH-05); without it they stay.
      let requirements = input.requirements;
      if (requirements === undefined) {
        requirements = await this.repo.findRequirements(booking.id);
      } else {
        await this.repo.replaceRequirements(booking.id, requirements);
      }

      return { ...stored, requirements, tables };
    });

    // After the commit and not awaited, like the confirmation email.
    void this.confirmationSender.sendChange(result.id);
    return result;
  }

  // Locks the given slots in id order, so two changes that lock the same slots never wait for
  // each other in a circle. Returns when each existing slot starts.
  private async lockSlots(slotIds: number[]): Promise<Map<number, Date>> {
    const starts = new Map<number, Date>();
    for (const id of [...new Set(slotIds)].sort((a, b) => a - b)) {
      const startsAt = await this.repo.lockSlotAndGetStart(id, this.config.bookingTimeZone);
      if (startsAt) starts.set(id, startsAt);
    }
    return starts;
  }
}
