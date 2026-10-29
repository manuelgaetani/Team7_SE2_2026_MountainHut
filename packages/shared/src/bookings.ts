import { z } from 'zod';

const positiveInt = z.number().int().positive();

export const createBookingSchema = z.object({
  slotId: positiveInt,
  partySize: positiveInt,
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export interface BookingResult {
  id: number;
  slotId: number;
  partySize: number;
  status: 'CONFIRMED' | 'PENDING' | 'REJECTED';
  tables: { tableNumber: number; assignedSeats: number }[];
}