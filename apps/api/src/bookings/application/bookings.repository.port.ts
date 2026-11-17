import type { BookingStatus, PartyRequirement } from '@mountain-hut/shared';
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

// Storage of the bookings. Inside UnitOfWork.run every call joins the transaction: the slot
// lock in particular lasts until the run ends.
export abstract class BookingsRepository {
  // Slots that have not started yet, with the seats left over all their tables.
  abstract findUpcomingSlots(timeZone: string, now: Date): Promise<UpcomingSlot[]>;

  // Locks the slot and the overlapping slots that share a table with it, so the other bookings
  // on those tables wait until the run ends, and returns when the slot starts.
  // null if the slot does not exist.
  abstract lockSlotAndGetStart(slotId: number, timeZone: string): Promise<Date | null>;

  // Free seats of each table of the slot: its seats minus those of the active bookings of the
  // overlapping slots.
  abstract findFreeSeatsByTable(slotId: number): Promise<TableFreeSeats[]>;

  // Hiker profile of the user. null if the user does not have one.
  abstract findHikerIdByUserId(userId: number): Promise<number | null>;

  // A rejected booking does not stop the hiker from trying again.
  abstract hasActiveBooking(hikerId: number, slotId: number): Promise<boolean>;

  abstract createBooking(booking: NewBooking): Promise<StoredBooking>;

  // Confirms a booking that is still pending. False if it is not pending any more.
  abstract confirmBooking(bookingId: number): Promise<boolean>;

  abstract createBookingTables(
    bookingId: number,
    slotId: number,
    allocation: SeatAllocation[],
  ): Promise<void>;
}
