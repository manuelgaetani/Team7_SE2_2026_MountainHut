import { toIsoDate } from '../lib/dates.ts';
import { ApiError } from './client.ts';

// TODO(MH-02): the slot API (POST /api/slots, PUT /api/slots/:id/tables and
// GET /api/slots/schedule) is not in master yet. Until the frontend integration these
// functions keep the slots in memory, with the same rules and error messages as the API,
// so the staff pages can be built and tried without the backend. The types are the ones of
// packages/shared/src/slots.ts on the MH-02 branch.

export interface SlotTable {
  tableNumber: number;
  seats: number;
}

export interface SlotDetails {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  tables: SlotTable[];
  totalSeats: number;
}

// Tables given as a list, or copied from another slot.
export interface TablesSource {
  tables?: SlotTable[];
  copyTablesFromSlotId?: number;
}

export interface NewSlot extends TablesSource {
  date: string;
  startTime: string;
  endTime: string;
}

interface StoredSlot {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  tables: SlotTable[];
}

const stored: StoredSlot[] = [];
let nextId = 1;

function store(slot: Omit<StoredSlot, 'id'>): StoredSlot {
  const created = { id: nextId++, ...slot };
  stored.push(created);
  return created;
}

const toDetails = (slot: StoredSlot): SlotDetails => ({
  ...slot,
  tables: slot.tables.map((t) => ({ ...t })),
  totalSeats: slot.tables.reduce((sum, t) => sum + t.seats, 0),
});

// A few sample slots today and tomorrow, to have something to look at and to copy from.
for (const offset of [0, 1]) {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  const date = toIsoDate(day);
  const lunch = [
    { tableNumber: 1, seats: 4 },
    { tableNumber: 2, seats: 6 },
    { tableNumber: 3, seats: 2 },
  ];
  store({ date, startTime: '12:00', endTime: '13:00', tables: lunch });
  store({ date, startTime: '13:00', endTime: '14:00', tables: lunch });
  store({ date, startTime: '19:30', endTime: '21:00', tables: [] });
}

function resolveTables(source: TablesSource): SlotTable[] {
  if (source.tables) return source.tables.map((t) => ({ ...t }));
  if (source.copyTablesFromSlotId === undefined) return [];
  const from = stored.find((s) => s.id === source.copyTablesFromSlotId);
  if (!from) throw new ApiError(404, 'The slot to copy the tables from does not exist');
  if (from.tables.length === 0) {
    throw new ApiError(422, 'The slot to copy the tables from has no tables');
  }
  return from.tables.map((t) => ({ ...t }));
}

// The slots of one day, ordered by start time.
export async function fetchSchedule(date: string): Promise<SlotDetails[]> {
  return stored
    .filter((s) => s.date === date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map(toDetails);
}

export async function createSlot(input: NewSlot): Promise<SlotDetails> {
  const { date, startTime, endTime } = input;
  if (stored.some((s) => s.date === date && s.startTime === startTime && s.endTime === endTime)) {
    throw new ApiError(409, 'A slot with the same date, start and end already exists');
  }
  return toDetails(store({ date, startTime, endTime, tables: resolveTables(input) }));
}

// Only for a slot without tables: changing an existing table set is MH-19.
export async function defineSlotTables(id: number, source: TablesSource): Promise<SlotDetails> {
  const slot = stored.find((s) => s.id === id);
  if (!slot) throw new ApiError(404, 'Slot not found');
  if (slot.tables.length > 0) {
    throw new ApiError(409, 'This slot already has tables: changing them is MH-19');
  }
  slot.tables = resolveTables(source);
  return toDetails(slot);
}
