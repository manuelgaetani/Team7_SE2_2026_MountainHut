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
  ChangeBookingInput,
  ChangedBookingResult,
  CreateBookingInput,
  SlotSummary,
} from '@mountain-hut/shared';
import { bookingTimeZone } from '../common/booking-config.js';
import type { Prisma } from '../generated/prisma/client.js';
import { NotificationService } from '../notifications/notification.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isChangeAdmitted } from './booking-change-cutoff.js';
import { decideBooking, isBookableInTime, slotAvailability } from './booking-policy.js';
import { BookingsRepository } from './bookings.repository.js';
import { canAccommodatePartyChange } from './change-seat-allocation.js';

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

  // Changes the slot, the party size or the requirements of a booking of the logged-in hiker.
  // Allowed up to 48 hours before the booked slot; a new slot must start in 2 hours or more.
  async change(
    userId: number,
    bookingId: number,
    input: ChangeBookingInput,
  ): Promise<ChangedBookingResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const hikerId = await this.repo.findHikerIdByUserId(tx, userId);
      if (!hikerId) throw new ForbiddenException('You can only change your own bookings');

      const booking = await this.repo.lockBooking(tx, bookingId);
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.hikerId !== hikerId) {
        throw new ForbiddenException('You can only change your own bookings');
      }
      if (booking.status === 'REJECTED') {
        throw new ConflictException('A rejected booking cannot be changed');
      }

      const slotId = input.slotId ?? booking.slotId;
      const partySize = input.partySize ?? booking.partySize;
      const movesSlot = slotId !== booking.slotId;

      const starts = await this.lockSlots(tx, [booking.slotId, slotId]);
      const now = new Date();
      if (!isChangeAdmitted(starts.get(booking.slotId)!, now)) {
        throw new UnprocessableEntityException(
          'Changes are only admitted up to 48 hours before the booked date',
        );
      }
      if (movesSlot) {
        const targetStart = starts.get(slotId);
        if (!targetStart) throw new NotFoundException('Target slot not found');
        if (!isBookableInTime(targetStart, now)) {
          throw new UnprocessableEntityException(
            'Less than 2 hours remaining before the slot starts',
          );
        }
        if (await this.repo.hasActiveBooking(tx, hikerId, slotId)) {
          throw new ConflictException('You already have a booking for this slot');
        }
      }

      const current = await this.repo.findBookingTables(tx, booking.id);
      let tables = current;
      if (movesSlot || partySize !== booking.partySize) {
        const free = await this.repo.findFreeSeatsByTable(tx, slotId, booking.id);
        const allocation = canAccommodatePartyChange(free, partySize, movesSlot ? [] : current);
        if (!allocation) {
          throw new ConflictException('Insufficient seats available for the updated booking');
        }
        tables = allocation;
      }

      const requirements =
        input.requirements === undefined ? booking.requirements : input.requirements || null;
      // The old assignments go first: they point to the booking with its old slot.
      await this.repo.deleteBookingTables(tx, booking.id);
      const stored = await this.repo.updateBooking(tx, booking.id, {
        slotId,
        partySize,
        requirements,
      });
      await this.repo.createBookingTables(tx, booking.id, slotId, tables);

      return { ...stored, requirements, tables };
    });

    // After the commit and not awaited, like the confirmation email.
    void this.sendChange(result.id);
    return result;
  }

  // Locks the given slots in id order, so two changes that lock the same slots never wait for
  // each other in a circle. Returns when each existing slot starts.
  private async lockSlots(
    tx: Prisma.TransactionClient,
    slotIds: number[],
  ): Promise<Map<number, Date>> {
    const starts = new Map<number, Date>();
    for (const id of [...new Set(slotIds)].sort((a, b) => a - b)) {
      const startsAt = await this.repo.lockSlotAndGetStart(tx, id, bookingTimeZone());
      if (startsAt) starts.set(id, startsAt);
    }
    return starts;
  }

  // Tells the hiker about the change. A single attempt: the booking is already changed, and a
  // failure is recorded in the notifications table.
  private async sendChange(bookingId: number): Promise<void> {
    try {
      const data = await this.repo.findBookingConfirmation(this.prisma, bookingId);
      if (data) await this.notifications.sendBookingChange(data.recipient, data.booking);
    } catch (err) {
      this.logger.error(`Change email of booking ${bookingId} not sent`, err);
    }
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
