import { z } from 'zod';
import { MAX_DB_INT, localDateSchema, localTimeSchema } from './primitives.js';

// MH-20: a hiker registers a planned hike before departure, so the hut knows where to look if
// they do not come back. What a hike holds comes from course issues #49 and #51.

export const MAX_HIKE_DESTINATION_LENGTH = 100;
export const MAX_HIKE_ROUTE_LENGTH = 500;
export const MAX_HIKE_PASSAGE_POINT_LENGTH = 100;
export const MAX_HIKE_PASSAGE_POINTS = 10;

const hasNoNulByte = (s: string): boolean => !s.includes('\u0000');

const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`)
    .refine(hasNoNulByte, `${label} contains an invalid character`);

// Local date and time of the hut as one sortable string, e.g. "2026-11-25T08:30".
export const hikeMoment = (date: string, time: string): string => `${date}T${time}`;

export const registerHikeSchema = z
  .object({
    destination: text(MAX_HIKE_DESTINATION_LENGTH, 'Destination'),
    route: text(MAX_HIKE_ROUTE_LENGTH, 'Route'),
    // Optional intermediate points, in the order they are passed.
    passagePoints: z
      .array(text(MAX_HIKE_PASSAGE_POINT_LENGTH, 'Passage point'))
      .max(MAX_HIKE_PASSAGE_POINTS, `At most ${MAX_HIKE_PASSAGE_POINTS} passage points`)
      .default([]),
    departureDate: localDateSchema,
    departureTime: localTimeSchema,
    returnDate: localDateSchema,
    returnTime: localTimeSchema,
    // The hike of the hut's list the hiker started from, if any. The fields above are still
    // required: the hiker may have changed them.
    predefinedHikeId: z.number().int().positive().max(MAX_DB_INT).optional(),
  })
  .refine(
    (h) => hikeMoment(h.returnDate, h.returnTime) > hikeMoment(h.departureDate, h.departureTime),
    {
      message: 'The expected return must be after the planned departure',
      path: ['returnTime'],
    },
  );
export type RegisterHikeInput = z.input<typeof registerHikeSchema>;
export type RegisterHikeData = z.output<typeof registerHikeSchema>;

// A hike of the hut's list: the hiker picks one to fill the form (issue #49).
export interface PredefinedHike {
  id: number;
  destination: string;
  route: string;
  passagePoints: string[];
}

// A registered hike. Dates and times are in the hut's local time.
export interface RegisteredHike {
  id: number;
  destination: string;
  route: string;
  passagePoints: string[];
  departureDate: string;
  departureTime: string;
  returnDate: string;
  returnTime: string;
  predefinedHikeId: number | null;
}

// Who registered a hike, as the staff need it to reach them or their contact person.
export interface HikeHiker {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  emergencyContact: string | null;
}

// A registered hike seen by the hut staff, with its hiker.
export interface StaffHike extends RegisteredHike {
  hiker: HikeHiker;
}
