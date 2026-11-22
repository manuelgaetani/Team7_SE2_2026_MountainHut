import { z } from 'zod';

// Building blocks used by several modules of this package. This module imports no other module
// of the package, so bookings.ts and slots.ts can both use it without importing each other: a
// circular import fails at runtime with "Cannot access ... before initialization".

// Maximum value of a Postgres INTEGER: larger numbers would fail in the database.
export const MAX_DB_INT = 2_147_483_647;

const isCalendarDate = (s: string): boolean => {
  const parsed = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s;
};

// Calendar date in the hut's local time, e.g. "2026-11-02".
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD')
  .refine(isCalendarDate, 'Not a valid calendar date');

// Time of day in the hut's local time, e.g. "12:30".
export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time as HH:MM');
