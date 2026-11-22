import type {
  BookingStatus,
  CancelledBooking,
  MyBooking,
  PartyRequirement,
} from '@mountain-hut/shared';
import type { SeatAllocation, TableFreeSeats } from '../domain/seat-allocation.js';

export interface NewBooking {
  hikerId: number;
  slotId: number;
  partySize: number;
  requirements: PartyRequirement[];
}

export interface UpcomingSlot {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  startsAt: Date;
  freeSeats: number;
}

export interface StoredBooking {
  id: number;
  slotId: number;
  partySize: number;
  status: BookingStatus;
}

// A locked booking can also be one that is already cancelled (MH-08).
export interface LockedBooking extends Omit<StoredBooking, 'status'> {
  hikerId: number;
  status: BookingStatus | 'CANCELLED';
}

export interface BookingChange {
  slotId: number;
  partySize: number;
}

// Storage of the bookings. Inside UnitOfWork.run every call joins the transaction: the slot
// lock in particular lasts until the run ends.
export abstract class BookingsRepository {
  // Slots that have not started yet, with the seats left over all their tables.
  abstract findUpcomingSlots(timeZone: string, now: Date): Promise<UpcomingSlot[]>;

  // MH-04: the slot that includes a hut-local date ('YYYY-MM-DD') and time ('HH:MM') and has
  // not started yet: it starts at or before the time and ends after it, so where two contiguous
  // slots meet the later one is taken. Slots of a day cannot overlap (MH-02); slots created before
  // that rule could, and then the earliest one (the oldest if they start together) is taken.
  // Times as 'HH:MM'. null if there is none.
  abstract findSlotAt(
    date: string,
    time: string,
    timeZone: string,
    now: Date,
  ): Promise<{ id: number; startsAt: Date; startTime: string; endTime: string } | null>;

  // Bookings of a hiker whose slot has not started yet, the soonest first.
  abstract findUpcomingBookingsOfHiker(
    hikerId: number,
    timeZone: string,
    now: Date,
  ): Promise<MyBooking[]>;

  // Locks the slot and the overlapping slots that share a table with it, so the other bookings
  // on those tables wait until the run ends, and returns when the slot starts.
  // null if the slot does not exist.
  abstract lockSlotAndGetStart(slotId: number, timeZone: string): Promise<Date | null>;

  // Free seats of each table of the slot: its seats minus those of the active bookings of the
  // overlapping slots.
  // excludeBookingId: a booking being changed, whose own seats count as free.
  abstract findFreeSeatsByTable(
    slotId: number,
    excludeBookingId?: number,
  ): Promise<TableFreeSeats[]>;

  // Hiker profile of the user. null if the user does not have one.
  abstract findHikerIdByUserId(userId: number): Promise<number | null>;

  // A rejected or cancelled booking does not stop the hiker from trying again.
  abstract hasActiveBooking(hikerId: number, slotId: number): Promise<boolean>;

  abstract createBooking(booking: NewBooking): Promise<StoredBooking>;

  // Confirms a booking that is still pending. False if it is not pending any more.
  abstract confirmBooking(bookingId: number): Promise<boolean>;

  abstract createBookingTables(
    bookingId: number,
    slotId: number,
    allocation: SeatAllocation[],
  ): Promise<void>;

  // Locks the booking row until the run ends, so two changes or cancellations of the same
  // booking run one after the other. null if the booking does not exist.
  abstract lockBooking(bookingId: number): Promise<LockedBooking | null>;

  // Marks the booking as cancelled: its seats are free again for the other bookings.
  abstract cancelBooking(bookingId: number): Promise<CancelledBooking>;

  abstract deleteBookingTables(bookingId: number): Promise<void>;

  abstract updateBooking(bookingId: number, change: BookingChange): Promise<StoredBooking>;

  // Party requirements of the booking, in the order the hiker entered them.
  abstract findRequirements(bookingId: number): Promise<PartyRequirement[]>;

  // Replaces the party requirements of the booking with the given list, kept in its order.
  abstract replaceRequirements(bookingId: number, requirements: PartyRequirement[]): Promise<void>;
}
