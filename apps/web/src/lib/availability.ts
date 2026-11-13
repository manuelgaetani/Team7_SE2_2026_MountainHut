import type { AvailabilityResult } from '@mountain-hut/shared';
import { ApiError } from '../api/client.ts';
import { dateShort, fromIsoDate } from './dates.ts';

export const peopleLabel = (n: number): string => (n === 1 ? '1 person' : `${n} people`);

const seatsLabel = (n: number): string => (n === 1 ? '1 free seat' : `${n} free seats`);

// "Sat 15 Jun at 12:00 for 3 people"
export const askedLabel = (r: AvailabilityResult): string =>
  `${dateShort(fromIsoDate(r.date))} at ${r.time} for ${peopleLabel(r.partySize)}`;

// Why the party cannot book that slot. No other slot is suggested (MH-04).
export function unavailableReason(r: AvailabilityResult): string {
  switch (r.reason) {
    case 'NO_SLOT':
      return `There is no time slot starting at ${r.time} on ${dateShort(fromIsoDate(r.date))}. Try another date or time.`;
    case 'TOO_LATE':
      return 'The slot starts in less than 2 hours, so it can no longer be booked online.';
    default: {
      const free = r.totalFreeSeats ?? 0;
      return free === 0
        ? 'Insufficient seats: the slot is full.'
        : `Insufficient seats: the slot has only ${seatsLabel(free)}.`;
    }
  }
}

export function availabilityError(e: unknown): string {
  if (e instanceof ApiError && e.status === 400)
    return 'Check the date, the time and the party size.';
  return 'The check failed. Please try again.';
}
