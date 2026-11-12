import { z } from 'zod';

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

// What a hiker can change in a booking: the slot (date and time), the party size and the
// requirements, in any combination. `requirements: null` removes them.
export const changeBookingSchema = z
  .object({
    slotId: z.number().int().positive().max(MAX_DB_INT).optional(),
    partySize: z.number().int().positive().max(MAX_DB_INT).optional(),
    requirements: z
      .string()
      .trim()
      .max(MAX_REQUIREMENTS_LENGTH)
      .refine(hasNoNulByte)
      .nullable()
      .optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined), {
    message: 'At least one field (slotId, partySize, requirements) must be provided',
  });
export type ChangeBookingInput = z.infer<typeof changeBookingSchema>;

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

// A booking after a change: the requirements are returned too, since they can change.
export interface ChangedBookingResult extends BookingResult {
  requirements: string | null;
}
