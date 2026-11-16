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

  // Tables of the slot, ordered by number.
  abstract findTables(slotId: number): Promise<SlotTable[]>;

  // Returns the id of the new slot.
  abstract create(slot: NewSlot): Promise<number>;

  abstract createTables(slotId: number, tables: SlotTable[]): Promise<void>;
}
