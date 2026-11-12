import { z } from 'zod';
import { localDateSchema, localTimeSchema } from './slots.js';

// Maximum value of a Postgres INTEGER: larger ids would fail in the database.
const MAX_DB_INT = 2_147_483_647;

export const MAX_REQUIREMENTS_LENGTH = 500;

// Postgres text columns cannot store a NUL byte.
const hasNoNulByte = (s: string): boolean => !s.includes('\u0000');

export const createBookingSchema = z.object({
  slotId: z.number().int().positive().max(MAX_DB_INT),
  // The only upper limit is the number of free seats in the slot, checked by the API.
  partySize: z.number().int().positive(),
  // Party needs, e.g. allergies.
  requirements: z.string().trim().max(MAX_REQUIREMENTS_LENGTH).refine(hasNoNulByte).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export type SlotAvailability = 'AVAILABLE' | 'FULL' | 'TOO_LATE';

export interface SlotSummary {
  id: number;
  // Local time of the hut.
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  freeSeats: number;
  availability: SlotAvailability;
}

export interface BookingResult {
  id: number;
  slotId: number;
  partySize: number;
  status: 'CONFIRMED' | 'PENDING' | 'REJECTED';
  tables: { tableNumber: number; assignedSeats: number }[];
}

// MH-04: public check of the tables available for a date, a time and a party size.
// Query strings only carry strings: the party size must be written as plain digits.
export const checkAvailabilityQuerySchema = z.object({
  date: localDateSchema,
  // Start time of the slot.
  time: localTimeSchema,
  partySize: z
    .string()
    .regex(/^\d+$/, 'Expected a whole number')
    .transform(Number)
    .pipe(z.number().int().positive().max(MAX_DB_INT)),
});
export type CheckAvailabilityQuery = z.infer<typeof checkAvailabilityQuerySchema>;

// NO_SLOT: no slot starts at that date and time, or it has already started.
// TOO_LATE: the slot starts in less than 2 hours, so it cannot be booked online (MH-01),
// but the hut staff can still enter a reservation (MH-07).
export type AvailabilityReason = 'NO_SLOT' | 'INSUFFICIENT_SEATS' | 'TOO_LATE';

export interface AvailabilityResult {
  available: boolean;
  date: string;
  time: string;
  partySize: number;
  reason?: AvailabilityReason;
  // Free seats over all the tables of the slot. Missing when there is no slot.
  totalFreeSeats?: number;
  // How the party would be seated: present when it fits, also when it is too late to book.
  tables?: { tableNumber: number; seats: number }[];
  breakdown?: number[];
  breakdownText?: string;
}
