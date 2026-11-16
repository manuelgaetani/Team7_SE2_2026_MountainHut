import type { SlotAvailability } from '@mountain-hut/shared';
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

// What a hiker can do with a slot right now.
export function slotAvailability(startsAt: Date, now: Date, freeSeats: number): SlotAvailability {
  if (!isBookableInTime(startsAt, now)) return 'TOO_LATE';
  return freeSeats > 0 ? 'AVAILABLE' : 'FULL';
}

// Decide se la prenotazione è accettabile e su quali tavoli.
export function decideBooking(req: BookingRequest): BookingDecision {
  if (!isBookableInTime(req.startsAt, req.now)) return { ok: false, reason: 'TOO_LATE' };
  const allocation = allocateSeats(req.tables, req.partySize);
  if (!allocation) return { ok: false, reason: 'NOT_ENOUGH_SEATS' };
  return { ok: true, allocation };
}

export type AvailabilityStatus = 'AVAILABLE' | 'INSUFFICIENT_SEATS' | 'TOO_LATE';

export interface AvailabilityCheck {
  status: AvailabilityStatus;
  freeSeats: number;
  // The seats a booking made now would get; null if the party does not fit.
  allocation: SeatAllocation[] | null;
}

// MH-04: the same rules as decideBooking, without booking. When it is too late to book online
// the allocation is still returned, so the user knows the seats are there (MH-07: the staff
// can still enter the reservation).
export function checkAvailability(req: BookingRequest): AvailabilityCheck {
  const freeSeats = req.tables.reduce((sum, t) => sum + Math.max(t.freeSeats, 0), 0);
  const allocation = allocateSeats(req.tables, req.partySize);
  if (!isBookableInTime(req.startsAt, req.now))
    return { status: 'TOO_LATE', freeSeats, allocation };
  return { status: allocation ? 'AVAILABLE' : 'INSUFFICIENT_SEATS', freeSeats, allocation };
}

export function formatBreakdown(seats: number[]): string {
  const total = seats.reduce((sum, n) => sum + n, 0);
  return `${seats.join(' + ')} ${total === 1 ? 'seat' : 'seats'}`;
}
