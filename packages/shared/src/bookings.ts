import { z } from 'zod';

// Maximum value of a Postgres INTEGER: larger ids would fail in the database.
const MAX_DB_INT = 2_147_483_647;
// Provisional sanity cap, not defined by the story. The real limit is the
// number of free seats in the slot, which the API checks.
export const MAX_PARTY_SIZE = 100;

export const createBookingSchema = z.object({
  slotId: z.number().int().positive().max(MAX_DB_INT),
  partySize: z.number().int().positive().max(MAX_PARTY_SIZE),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export interface BookingResult {
  id: number;
  slotId: number;
  partySize: number;
  status: 'CONFIRMED' | 'PENDING' | 'REJECTED';
  tables: { tableNumber: number; assignedSeats: number }[];
}