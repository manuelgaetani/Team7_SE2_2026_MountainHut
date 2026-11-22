import type { SlotTable } from '@mountain-hut/shared';
import type { FloorAllocation } from '../domain/floor-plan.js';
import type { NewSlot, Slot } from '../domain/slot.js';

// Storage of the slots and their tables. Inside UnitOfWork.run every call joins the transaction.
export abstract class SlotsRepository {
  // null if the slot does not exist.
  abstract findById(id: number): Promise<Slot | null>;

  // Slots of the date, ordered by start time.
  abstract findByDate(date: string): Promise<Slot[]>;

  // Locks the slot until the end of the transaction, so two requests cannot define its tables
  // at the same time. False if the slot does not exist.
  abstract lock(id: number): Promise<boolean>;

  // Locks the day until the end of the transaction, so two requests cannot change the slots of
  // the same day at the same time (create overlapping slots, or replace a week of them). Works
  // even when the day has no slots yet.
  abstract lockDay(date: string): Promise<void>;

  // A slot of the same day that overlaps the given times, if any (the earliest one). Slots that
  // only touch (one ends when the other starts) do not overlap.
  abstract findOverlapping(slot: NewSlot): Promise<Slot | null>;

  // Locks the slots from one date to another, both included, until the end of the transaction,
  // in id order. A booking locks its slot row, not the day: this makes a booking in progress on
  // these slots finish first, or wait until the transaction ends.
  abstract lockBetween(from: string, to: string): Promise<void>;

  // Slots from one date to another, both included, by date and start time, with their tables.
  abstract findBetween(from: string, to: string): Promise<Slot[]>;

  // Days ('YYYY-MM-DD'), between two dates both included, with a slot that has reservations:
  // bookings that take seats (pending or confirmed). In date order.
  abstract findReservedDates(from: string, to: string): Promise<string[]>;

  // Deletes slots with their tables. Bookings left on them take no seats (the caller checks
  // there are no reservations) and are deleted too, with their table assignments.
  abstract deleteSlots(ids: number[]): Promise<void>;

  // Tables of the slot, ordered by number.
  abstract findTables(slotId: number): Promise<SlotTable[]>;

  // Returns the id of the new slot.
  abstract create(slot: NewSlot): Promise<number>;

  abstract createTables(slotId: number, tables: SlotTable[]): Promise<void>;

  // Seats taken at each table of the slot by the active (confirmed or pending) bookings of every
  // slot of the same day that overlaps it, since tables are shared. Empty if the slot does not exist.
  abstract findFloorAllocations(slotId: number): Promise<FloorAllocation[]>;
}
