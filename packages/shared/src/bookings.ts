import { z } from 'zod';

// Maximum value of a Postgres INTEGER: larger ids would fail in the database.
const MAX_DB_INT = 2_147_483_647;

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

export interface BookingResult {
  id: number;
  slotId: number;
  partySize: number;
  requirements: PartyRequirement[];
  status: 'CONFIRMED' | 'PENDING' | 'REJECTED';
  tables: { tableNumber: number; assignedSeats: number }[];
}
