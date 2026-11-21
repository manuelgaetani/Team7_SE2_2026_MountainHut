import { describe, expect, it } from 'vitest';
import type { AvailabilityResult } from '@mountain-hut/shared';
import { ApiError } from '../api/client.ts';
import { askedLabel, availabilityError, peopleLabel, unavailableReason } from './availability.ts';

const baseResult: AvailabilityResult = {
  available: false,
  date: '2026-11-14',
  time: '12:34',
  partySize: 3,
};

describe('availability helpers', () => {
  describe('peopleLabel', () => {
    it.each([
      [1, '1 person'],
      [2, '2 people'],
      [5, '5 people'],
    ])('formats %i as %s', (count, expected) => {
      expect(peopleLabel(count)).toBe(expected);
    });
  });

  describe('askedLabel', () => {
    it('formats the slot window when a slot includes the requested time', () => {
      expect(
        askedLabel({
          ...baseResult,
          available: true,
          slot: { startTime: '12:00', endTime: '13:30' },
        }),
      ).toBe('Sat 14 Nov, slot 12:00–13:30, for 3 people');
    });

    it('formats the requested time and singular party size when no slot matches', () => {
      expect(askedLabel({ ...baseResult, partySize: 1 })).toBe('Sat 14 Nov at 12:34 for 1 person');
    });
  });

  describe('unavailableReason', () => {
    it('explains NO_SLOT with time and formatted date', () => {
      expect(unavailableReason({ ...baseResult, reason: 'NO_SLOT' })).toBe(
        'There is no time slot at 12:34 on Sat 14 Nov. Try another date or time.',
      );
    });

    it('explains TOO_LATE cutoff', () => {
      expect(unavailableReason({ ...baseResult, reason: 'TOO_LATE' })).toBe(
        'The slot starts in less than 2 hours, so it can no longer be booked online.',
      );
    });

    it.each([0, undefined])(
      'explains full slot when INSUFFICIENT_SEATS has totalFreeSeats=%s',
      (totalFreeSeats) => {
        expect(
          unavailableReason({ ...baseResult, reason: 'INSUFFICIENT_SEATS', totalFreeSeats }),
        ).toBe('Insufficient seats: the slot is full.');
      },
    );

    it.each([
      [1, 'Insufficient seats: the slot has only 1 free seat.'],
      [3, 'Insufficient seats: the slot has only 3 free seats.'],
    ])('explains remaining capacity when totalFreeSeats=%i', (totalFreeSeats, expected) => {
      expect(
        unavailableReason({ ...baseResult, reason: 'INSUFFICIENT_SEATS', totalFreeSeats }),
      ).toBe(expected);
    });
  });

  describe('availabilityError', () => {
    it('returns field check message for 400 ApiError', () => {
      expect(availabilityError(new ApiError(400, 'Invalid'))).toBe(
        'Check the date, the time and the party size.',
      );
    });

    it('returns generic retry message for other ApiError statuses and unexpected errors', () => {
      expect(availabilityError(new ApiError(500, 'Boom'))).toBe(
        'The check failed. Please try again.',
      );
      expect(availabilityError(new Error('Network down'))).toBe(
        'The check failed. Please try again.',
      );
    });
  });
});
