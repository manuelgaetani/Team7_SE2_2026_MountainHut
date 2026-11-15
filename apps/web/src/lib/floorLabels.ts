import type { FloorGroup } from '@mountain-hut/shared';
import { ApiError } from '../api/client.ts';
import type { MomentTable } from './floorMoments.ts';
import { seatsLabel } from './slotTables.ts';

export const peopleLabel = (n: number): string => (n === 1 ? '1 person' : `${n} people`);

// "4 / 6 taken", or "full" when no seat is left.
export function tableTakenLabel(table: MomentTable): string {
  const taken = table.capacity - table.freeSeats;
  return table.freeSeats === 0 ? 'full' : `${taken} / ${table.capacity} taken`;
}

// "5 / 8 seats taken"
export const seatsTakenLabel = (taken: number, total: number): string =>
  `${taken} / ${total} seats taken`;

// "T4 · 6 + T5 · 2"
export const groupTablesLabel = (group: FloorGroup): string =>
  group.tables.map((t) => `T${t.tableNumber} · ${t.seats}`).join(' + ');

export const onTablesLabel = (n: number): string => (n === 1 ? 'on 1 table' : `on ${n} tables`);

// "the slot 12:00–13:00", or "the slots 11:30–12:30 and 13:00–14:00".
export function otherSlotsLabel(slots: string[]): string {
  if (slots.length === 1) return `the slot ${slots[0]}`;
  return `the slots ${slots.slice(0, -1).join(', ')} and ${slots[slots.length - 1]}`;
}

// aria-label of a taken seat button, e.g. "Group A, table 4, 6 seats".
export const seatAriaLabel = (label: string, tableNumber: number, seats: number): string =>
  `Group ${label}, table ${tableNumber}, ${seatsLabel(seats)}`;

// What the staff read when the plan cannot be loaded.
export function floorErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) {
    return 'The session has expired. Please log in again.';
  }
  if (e instanceof ApiError && e.status === 404) return 'Slot not found';
  if (e instanceof ApiError && e.status === 403) return e.message;
  return 'The floor plan could not be loaded. Please try again.';
}
