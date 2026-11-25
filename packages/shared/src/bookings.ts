import { z } from 'zod';
import { MAX_DB_INT, localDateSchema, localTimeSchema } from './primitives.js';

export const MAX_REQUIREMENTS_LENGTH = 500;

// Postgres text columns cannot store a NUL byte.
const hasNoNulByte = (s: string): boolean => !s.includes('\u0000');

// Only a limit against abuse: one entry can cover several people of the party.
export const MAX_REQUIREMENTS_COUNT = 20;

// The needs the hut lists for the kitchen (issue from Team 16): the hiker picks them instead of
// typing them, so the same need always has the same name. The order is the order on screen.
// `allergen` marks an allergy or intolerance: the kitchen must take care during the preparation.
export const DIETARY_OPTIONS = [
  { code: 'GLUTEN_FREE', label: 'Gluten-free', allergen: true },
  { code: 'LACTOSE_FREE', label: 'Lactose-free', allergen: true },
  { code: 'EGG_FREE', label: 'Egg-free', allergen: true },
  { code: 'NUT_FREE', label: 'Nut-free', allergen: true },
  { code: 'SOY_FREE', label: 'Soy-free', allergen: true },
  { code: 'VEGAN', label: 'Vegan', allergen: false },
  { code: 'VEGETARIAN', label: 'Vegetarian', allergen: false },
] as const;
export type DietaryOption = (typeof DIETARY_OPTIONS)[number];
export type DietaryCode = DietaryOption['code'];

const DIETARY_CODES = DIETARY_OPTIONS.map((o) => o.code) as [DietaryCode, ...DietaryCode[]];
export const dietaryCodeSchema = z.enum(DIETARY_CODES);

export const dietaryOption = (code: DietaryCode): DietaryOption =>
  DIETARY_OPTIONS.find((o) => o.code === code) as DietaryOption;

// Needs of a subset of the party, e.g. "Gluten-free, Vegan" or "shellfish".
export const partyRequirementSchema = z
  .object({
    // Needs picked from DIETARY_OPTIONS, each at most once. Missing in older clients.
    restrictions: z
      .array(dietaryCodeSchema)
      .refine((codes) => new Set(codes).size === codes.length)
      .default([]),
    // True when the free text describes an allergy or intolerance.
    allergies: z.boolean(),
    // A need that is not in the list ("Other"); empty when only listed needs are picked.
    description: z.string().trim().max(MAX_REQUIREMENTS_LENGTH).refine(hasNoNulByte),
  })
  .refine((r) => r.restrictions.length > 0 || r.description !== '', {
    message: 'Pick at least one need or describe it',
    path: ['description'],
  });
export type PartyRequirement = z.infer<typeof partyRequirementSchema>;

// True when the kitchen must take care: a listed allergen, or free text marked as an allergy.
export const hasAllergy = (r: PartyRequirement): boolean =>
  (r.allergies && r.description !== '') ||
  r.restrictions.some((code) => dietaryOption(code).allergen);

// One line for a requirement, e.g. "Gluten-free, Vegan, shellfish": the listed needs first.
export const requirementText = (r: PartyRequirement): string =>
  [...r.restrictions.map((code) => dietaryOption(code).label), r.description]
    .filter((part) => part !== '')
    .join(', ');

export const createBookingSchema = z.object({
  slotId: z.number().int().positive().max(MAX_DB_INT),
  // The only upper limit is the number of free seats in the slot, checked by the API.
  partySize: z.number().int().positive(),
  // One entry per subset of the party; omitted or empty when there are no needs.
  requirements: z.array(partyRequirementSchema).max(MAX_REQUIREMENTS_COUNT).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

// What a hiker can change in a booking: the slot (date and time), the party size and the
// requirements, in any combination. The requirements are the whole new list (MH-05): it replaces
// the old one, and `[]` removes them all.
export const changeBookingSchema = z
  .object({
    slotId: z.number().int().positive().max(MAX_DB_INT).optional(),
    partySize: z.number().int().positive().max(MAX_DB_INT).optional(),
    requirements: z.array(partyRequirementSchema).max(MAX_REQUIREMENTS_COUNT).optional(),
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

export type BookingStatus = 'CONFIRMED' | 'PENDING' | 'REJECTED';

export interface BookingResult {
  id: number;
  slotId: number;
  partySize: number;
  requirements: PartyRequirement[];
  status: BookingStatus;
  tables: { tableNumber: number; assignedSeats: number }[];
}

// Result of cancelling a booking. Its seats are free again.
export interface CancelledBooking {
  id: number;
  slotId: number;
  partySize: number;
  status: 'CANCELLED';
}

// A booking cancelled by the hiker (MH-08) stays in the list, with status CANCELLED.
export type MyBookingStatus = BookingResult['status'] | 'CANCELLED';

// A booking of the logged hiker, as listed in GET /api/bookings/me.
export interface MyBooking {
  id: number;
  slotId: number;
  // Local time of the hut.
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  partySize: number;
  // One entry per subset of the party (MH-05); empty when there are no needs.
  requirements: PartyRequirement[];
  status: MyBookingStatus;
}

// MH-04: public check of the tables available for a date, a time and a party size.
// Query strings only carry strings: the party size must be written as plain digits.
export const checkAvailabilityQuerySchema = z.object({
  date: localDateSchema,
  // A time of day: the slot that includes it is checked (it may have started earlier).
  time: localTimeSchema,
  partySize: z
    .string()
    .regex(/^\d+$/, 'Expected a whole number')
    .transform(Number)
    .pipe(z.number().int().positive().max(MAX_DB_INT)),
});
export type CheckAvailabilityQuery = z.infer<typeof checkAvailabilityQuerySchema>;

// NO_SLOT: no slot includes that date and time (start included, end excluded), or the slot
// has already started.
// TOO_LATE: the slot starts in less than 2 hours, so it cannot be booked online (MH-01),
// but the hut staff can still enter a reservation (MH-07).
export type AvailabilityReason = 'NO_SLOT' | 'INSUFFICIENT_SEATS' | 'TOO_LATE';

export interface AvailabilityResult {
  available: boolean;
  date: string;
  time: string;
  partySize: number;
  reason?: AvailabilityReason;
  // Start and end of the slot that includes the time asked. Missing when there is no slot.
  slot?: { startTime: string; endTime: string };
  // Free seats over all the tables of the slot. Missing when there is no slot.
  totalFreeSeats?: number;
  // How the party would be seated: present when it fits, also when it is too late to book.
  tables?: { tableNumber: number; seats: number }[];
  breakdown?: number[];
  breakdownText?: string;
}
