import { z } from 'zod';

// Maximum value of a Postgres INTEGER: larger numbers would fail in the database.
const MAX_DB_INT = 2_147_483_647;

const isCalendarDate = (s: string): boolean => {
  const parsed = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s;
};

// Calendar date of the slot in the hut's local time, e.g. "2026-11-02".
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD')
  .refine(isCalendarDate, 'Not a valid calendar date');

// Time of day in the hut's local time, e.g. "12:30".
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time as HH:MM');

const id = z.number().int().positive().max(MAX_DB_INT);

export const slotTableSchema = z.object({
  tableNumber: z.number().int().positive().max(MAX_DB_INT),
  seats: z.number().int().positive().max(MAX_DB_INT),
});

const tables = z
  .array(slotTableSchema)
  .min(1)
  .refine(
    (list) => new Set(list.map((t) => t.tableNumber)).size === list.length,
    'Table numbers must be unique within a slot',
  );

// A slot without tables has 0 seats and cannot be booked (MH-02, issue #17).
// Tables are given as a list, or copied from another slot so they don't have to be re-entered.
export const createSlotSchema = z
  .object({
    date,
    startTime: time,
    endTime: time,
    tables: tables.optional(),
    copyTablesFromSlotId: id.optional(),
  })
  .refine((s) => s.endTime > s.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  })
  .refine((s) => !(s.tables && s.copyTablesFromSlotId), {
    message: 'Give either tables or copyTablesFromSlotId, not both',
    path: ['copyTablesFromSlotId'],
  });
export type CreateSlotInput = z.infer<typeof createSlotSchema>;

// Defines the tables of an existing slot that has none yet: a list, or a copy of another slot.
export const defineSlotTablesSchema = z
  .object({
    tables: tables.optional(),
    copyTablesFromSlotId: id.optional(),
  })
  .refine((s) => (s.tables ? 1 : 0) + (s.copyTablesFromSlotId ? 1 : 0) === 1, {
    message: 'Give exactly one of tables or copyTablesFromSlotId',
  });
export type DefineSlotTablesInput = z.infer<typeof defineSlotTablesSchema>;

export const listSlotsQuerySchema = z.object({ date });
export type ListSlotsQuery = z.infer<typeof listSlotsQuerySchema>;

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
