import { fromIsoDate } from './dates.ts';

// MH-06: a booking can be changed up to 48 hours before its slot, and moved only to a slot that
// starts at least 48 hours from now. The API checks the same rule; here it only spares the hiker
// a request that would be refused.
export const CHANGE_LEAD_HOURS = 48;

const CHANGE_LEAD_MS = CHANGE_LEAD_HOURS * 60 * 60 * 1000;

/** True when a slot of the hut (date YYYY-MM-DD, start HH:MM) starts at least 48 hours after now. */
export function isChangeOpen(date: string, startTime: string, now: Date = new Date()): boolean {
  const start = fromIsoDate(date);
  const [hours, minutes] = startTime.split(':').map(Number);
  start.setHours(hours, minutes);
  return start.getTime() - now.getTime() >= CHANGE_LEAD_MS;
}
