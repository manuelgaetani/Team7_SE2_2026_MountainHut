import type { FloorGroup, FloorPlan, FloorTable } from '@mountain-hut/shared';
import { ApiError } from '../api/client.ts';
import { seatsLabel } from './slotTables.ts';

export const peopleLabel = (n: number): string => (n === 1 ? '1 person' : `${n} people`);

// "4 / 6 taken", or "full" when no seat is left.
export function tableTakenLabel(table: FloorTable): string {
  return table.freeSeats === 0 ? 'full' : `${table.occupiedSeats} / ${table.capacity} taken`;
}

// "5 / 8 seats taken"
export const seatsTakenLabel = (taken: number, total: number): string =>
  `${taken} / ${total} seats taken`;

// "T4 · 6 + T5 · 2"
export const groupTablesLabel = (group: FloorGroup): string =>
  group.tables.map((t) => `T${t.tableNumber} · ${t.seats}`).join(' + ');

export const onTablesLabel = (n: number): string => (n === 1 ? 'on 1 table' : `on ${n} tables`);

// The time of the slot a group booked, only when it is not the slot shown.
export function otherSlotTime(group: FloorGroup, slot: FloorPlan['slot']): string | null {
  if (group.startTime === slot.startTime && group.endTime === slot.endTime) return null;
  return `${group.startTime}–${group.endTime}`;
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
