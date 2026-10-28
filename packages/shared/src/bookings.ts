import { z } from 'zod';

// TODO(MH-01): stub without validation rules. Add the rules tested in bookings.spec.ts,
// then remove describe.skip there.
export const createBookingSchema = z.object({
  date: z.string(),
  time: z.string(),
  partySize: z.number(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
