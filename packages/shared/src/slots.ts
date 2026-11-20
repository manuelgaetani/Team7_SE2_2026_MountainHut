import { z } from 'zod';
import { MAX_DB_INT, localDateSchema, localTimeSchema } from './primitives.js';

// Calendar date of the slot in the hut's local time, e.g. "2026-11-02".
const date = localDateSchema;

// Time of day in the hut's local time, e.g. "12:30".
const time = localTimeSchema;

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

// Most weeks a copy can cover at once: a limit against mistakes.
export const MAX_REPEAT_WEEKS = 12;

export const repeatWeeklyScheduleSchema = z.object({
  sourceStartDate: date,
  repeatWeeks: z.number().int().min(1).max(MAX_REPEAT_WEEKS),
});
export type RepeatWeeklyScheduleInput = z.infer<typeof repeatWeeklyScheduleSchema>;

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

export interface RepeatWeeklyScheduleResult {
  // Number of weeks the source week was copied into.
  targetWeeks: number;
  createdSlotsCount: number;
  // Slots that were in the target weeks before the copy and were deleted.
  replacedSlotsCount: number;
  // Ordered by date and start time.
  createdSlots: SlotDetails[];
}
