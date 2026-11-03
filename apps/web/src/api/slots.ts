import type {
  CreateSlotInput,
  DefineSlotTablesInput,
  SlotDetails,
  SlotTable,
} from '@mountain-hut/shared';
import { apiGet, apiPost, apiPut } from './client.ts';

export type { SlotDetails, SlotTable };
export type TablesSource = DefineSlotTablesInput;
export type NewSlot = CreateSlotInput;

// The slots of one day, ordered by start time.
export async function fetchSchedule(date: string): Promise<SlotDetails[]> {
  const query = new URLSearchParams({ date }).toString();
  return apiGet<SlotDetails[]>(`/slots/schedule?${query}`);
}

export async function createSlot(input: NewSlot): Promise<SlotDetails> {
  return apiPost<SlotDetails>('/slots', input);
}

// Only for a slot without tables: changing an existing table set is MH-19.
export async function defineSlotTables(id: number, source: TablesSource): Promise<SlotDetails> {
  return apiPut<SlotDetails>(`/slots/${id}/tables`, source);
}
