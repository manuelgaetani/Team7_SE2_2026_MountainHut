import type { SlotTable } from '@mountain-hut/shared';
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
  // the same day at the same time. Works even when the day has no slots yet.
  abstract lockDay(date: string): Promise<void>;

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
}
