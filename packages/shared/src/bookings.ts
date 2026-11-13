import { z } from 'zod';

// Maximum value of a Postgres INTEGER: larger ids would fail in the database.
const MAX_DB_INT = 2_147_483_647;

export const MAX_REQUIREMENTS = 10;
export const MAX_REQUIREMENT_LENGTH = 200;

// Postgres text columns cannot store a NUL byte.
const hasNoNulByte = (s: string): boolean => !s.includes('\u0000');

// Needs of a subset of the party, e.g. "2 vegetarians". Maps to the PartyRequirement model.
export const partyRequirementSchema = z.object({
  // True when the need is an allergy: the kitchen must take special care.
  allergies: z.boolean(),
  description: z.string().trim().min(1).max(MAX_REQUIREMENT_LENGTH).refine(hasNoNulByte),
});
export type PartyRequirement = z.infer<typeof partyRequirementSchema>;

export const createBookingSchema = z.object({
  slotId: z.number().int().positive().max(MAX_DB_INT),
  // The only upper limit is the number of free seats in the slot, checked by the API.
  partySize: z.number().int().positive(),
  // Zero or more requirements, each for a subset of the party.
  requirements: z.array(partyRequirementSchema).max(MAX_REQUIREMENTS).optional(),
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
  requirements?: PartyRequirement[];
}
