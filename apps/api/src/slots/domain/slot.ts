import type { SlotTable } from '@mountain-hut/shared';

// A time slot with its tables. The date is 'YYYY-MM-DD' and the times 'HH:MM', hut-local.
export interface Slot {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  tables: SlotTable[];
}

export type NewSlot = Omit<Slot, 'id' | 'tables'>;
