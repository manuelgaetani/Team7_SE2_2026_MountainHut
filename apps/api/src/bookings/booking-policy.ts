import { allocateSeats } from './seat-allocation.js';
import type { SeatAllocation, TableFreeSeats } from './seat-allocation.js';

export const MIN_LEAD_MS = 2 * 60 * 60 * 1000;

export type BookingDecision =
  | { ok: true; allocation: SeatAllocation[] }
  | { ok: false; reason: 'TOO_LATE' | 'NOT_ENOUGH_SEATS' };

export interface BookingRequest {
  startsAt: Date;
  now: Date;
  partySize: number;
  tables: TableFreeSeats[];
}

// Si può prenotare fino a 2 ore prima.
export function isBookableInTime(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() >= MIN_LEAD_MS;
}

// Decide se la prenotazione è accettabile e su quali tavoli.
export function decideBooking(req: BookingRequest): BookingDecision {
  if (!isBookableInTime(req.startsAt, req.now)) return { ok: false, reason: 'TOO_LATE' };
  const allocation = allocateSeats(req.tables, req.partySize);
  if (!allocation) return { ok: false, reason: 'NOT_ENOUGH_SEATS' };
  return { ok: true, allocation };
}