import { z } from 'zod';
import { MAX_DB_INT } from './db-limits.js';
import { localDateSchema, localTimeSchema } from './slots.js';

export const MAX_REQUIREMENTS_LENGTH = 500;

// Postgres text columns cannot store a NUL byte.
const hasNoNulByte = (s: string): boolean => !s.includes('\u0000');

// Only a limit against abuse: one entry can cover several people of the party.
export const MAX_REQUIREMENTS_COUNT = 20;

// Needs of a subset of the party, e.g. "2 vegetarians".
export const partyRequirementSchema = z.object({
  // True when special care is needed during the preparation, e.g. allergies.
  allergies: z.boolean(),
  description: z.string().trim().min(1).max(MAX_REQUIREMENTS_LENGTH).refine(hasNoNulByte),
});
export type PartyRequirement = z.infer<typeof partyRequirementSchema>;

export const createBookingSchema = z.object({
  slotId: z.number().int().positive().max(MAX_DB_INT),
  // The only upper limit is the number of free seats in the slot, checked by the API.
  partySize: z.number().int().positive(),
  // One entry per subset of the party; omitted or empty when there are no needs.
  requirements: z.array(partyRequirementSchema).max(MAX_REQUIREMENTS_COUNT).optional(),
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

export type BookingStatus = 'CONFIRMED' | 'PENDING' | 'REJECTED';

export interface BookingResult {
  id: number;
  slotId: number;
  partySize: number;
  requirements: PartyRequirement[];
  status: BookingStatus;
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
