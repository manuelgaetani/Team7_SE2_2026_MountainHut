import { Injectable, NotImplementedException } from '@nestjs/common';
import type { CreateSlotInput, DefineSlotTablesInput, SlotDetails } from '@mountain-hut/shared';

// MH-02: employees define the tables and seats available in each time slot.
@Injectable()
export class SlotsService {
  // Creates a slot, optionally with its tables (a list, or a copy of another slot's tables).
  // 404 if copyTablesFromSlotId does not exist, 409 if a slot with the same date, start and end exists.
  create(input: CreateSlotInput): Promise<SlotDetails> {
    void input;
    throw new NotImplementedException();
  }

  // Slots of one day, ordered by start time, each with its tables and total seats.
  listByDate(date: string): Promise<SlotDetails[]> {
    void date;
    throw new NotImplementedException();
  }

  // 404 if the slot does not exist.
  findOne(id: number): Promise<SlotDetails> {
    void id;
    throw new NotImplementedException();
  }

  // Defines the tables of a slot that has none yet.
  // 404 if the slot (or the slot to copy from) does not exist; 409 if the slot already has tables:
  // changing an existing table set is MH-19.
  defineTables(id: number, input: DefineSlotTablesInput): Promise<SlotDetails> {
    void id;
    void input;
    throw new NotImplementedException();
  }
}
