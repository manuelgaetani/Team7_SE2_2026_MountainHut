import { ApiError } from '../api/client.ts';
import type { TablesSource } from '../api/slots.ts';

// A table row as typed in the form: the inputs hold text until the form is sent.
export interface TableDraft {
  tableNumber: string;
  seats: string;
}

// 'later': a slot without tables, which has 0 seats until its tables are defined.
export type TablesMode = 'list' | 'copy' | 'later';

export interface TablesChoice {
  mode: TablesMode;
  rows: TableDraft[];
  copyFromSlotId: number | null;
}

export const emptyTablesChoice = (): TablesChoice => ({
  mode: 'list',
  rows: [{ tableNumber: '1', seats: '' }],
  copyFromSlotId: null,
});

// The next free table number, so a new row is ready to fill in.
export function nextTableNumber(rows: TableDraft[]): string {
  const used = rows.map((r) => Number(r.tableNumber)).filter((n) => Number.isInteger(n));
  return String(Math.max(0, ...used) + 1);
}

const isPositiveInteger = (s: string): boolean => /^[1-9]\d*$/.test(s.trim());

// Checks the choice like the API does and turns it into the request field.
// The API checks everything again.
export function toTablesSource(
  choice: TablesChoice,
): { ok: true; source: TablesSource } | { ok: false; error: string } {
  if (choice.mode === 'later') return { ok: true, source: {} };
  if (choice.mode === 'copy') {
    if (choice.copyFromSlotId === null) {
      return { ok: false, error: 'Choose the slot to copy the tables from.' };
    }
    return { ok: true, source: { copyTablesFromSlotId: choice.copyFromSlotId } };
  }

  if (choice.rows.length === 0) return { ok: false, error: 'Add at least one table.' };
  if (!choice.rows.every((r) => isPositiveInteger(r.tableNumber) && isPositiveInteger(r.seats))) {
    return { ok: false, error: 'Every table needs a number and its seats, both above zero.' };
  }
  const tables = choice.rows.map((r) => ({
    tableNumber: Number(r.tableNumber),
    seats: Number(r.seats),
  }));
  if (new Set(tables.map((t) => t.tableNumber)).size !== tables.length) {
    return { ok: false, error: 'Two tables have the same number.' };
  }
  return { ok: true, source: { tables } };
}

// The API explains these cases: slot not found, slot already existing or with tables, nothing
// to copy, not a staff account.
export function slotErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) {
    return 'The session has expired. Please log in again.';
  }
  if (e instanceof ApiError && [403, 404, 409, 422].includes(e.status)) return e.message;
  return 'Saving failed. Please try again.';
}

export const seatsLabel = (n: number): string => (n === 1 ? '1 seat' : `${n} seats`);
export const tablesLabel = (n: number): string => (n === 1 ? '1 table' : `${n} tables`);
