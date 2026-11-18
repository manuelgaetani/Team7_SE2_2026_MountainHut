import { describe, expect, it } from 'vitest';
import { checkAvailabilityQuerySchema, createBookingSchema } from './bookings.js';

const MAX_DB_INT = 2_147_483_647;
const validBooking = { slotId: 1, partySize: 2 };

describe('createBookingSchema', () => {
  it('accepts a valid booking', () => {
    expect(createBookingSchema.safeParse(validBooking).success).toBe(true);
  });

  it('removes the fields it does not know', () => {
    const result = createBookingSchema.parse({ ...validBooking, hikerId: 99 });
    expect(result).toEqual(validBooking);
  });

  it.each(['slotId', 'partySize'])('rejects a booking without %s', (field) => {
    const booking: Record<string, unknown> = { ...validBooking };
    delete booking[field];
    expect(createBookingSchema.safeParse(booking).success).toBe(false);
  });

  it.each([1, MAX_DB_INT])('accepts the slotId %d', (slotId) => {
    expect(createBookingSchema.safeParse({ ...validBooking, slotId }).success).toBe(true);
  });

  it.each([0, -1, 1.5, MAX_DB_INT + 1, '1', null])('rejects the slotId %s', (slotId) => {
    expect(createBookingSchema.safeParse({ ...validBooking, slotId }).success).toBe(false);
  });

  it('accepts a booking without requirements', () => {
    expect(createBookingSchema.safeParse(validBooking).success).toBe(true);
  });

  it('trims the requirements', () => {
    const parsed = createBookingSchema.parse({ ...validBooking, requirements: '  no nuts ' });
    expect(parsed.requirements).toBe('no nuts');
  });

  it('accepts requirements up to the maximum length', () => {
    const requirements = 'a'.repeat(500);
    expect(createBookingSchema.safeParse({ ...validBooking, requirements }).success).toBe(true);
  });

  it.each(['a'.repeat(501), 'no\u0000nuts', 5, null])('rejects the requirements %j', (value) => {
    const parsed = createBookingSchema.safeParse({ ...validBooking, requirements: value });
    expect(parsed.success).toBe(false);
  });

  it.each([1, 100, 101, MAX_DB_INT])('accepts the partySize %d', (partySize) => {
    expect(createBookingSchema.safeParse({ ...validBooking, partySize }).success).toBe(true);
  });

  it.each([0, -1, 1.5, '2', null])('rejects the partySize %s', (partySize) => {
    expect(createBookingSchema.safeParse({ ...validBooking, partySize }).success).toBe(false);
  });
});

describe('checkAvailabilityQuerySchema', () => {
  const validQuery = { date: '2026-11-02', time: '12:00', partySize: '6' };

  it('accepts a valid query and turns the party size into a number', () => {
    expect(checkAvailabilityQuerySchema.parse(validQuery)).toEqual({
      date: '2026-11-02',
      time: '12:00',
      partySize: 6,
    });
  });

  it.each(['1', String(MAX_DB_INT)])('accepts the partySize "%s"', (partySize) => {
    const result = checkAvailabilityQuerySchema.safeParse({ ...validQuery, partySize });
    expect(result.success).toBe(true);
  });

  it.each(['0', '-1', '1.5', 'abc', '', ' 2', '2 ', '2e1', String(MAX_DB_INT + 1)])(
    'rejects the partySize "%s"',
    (partySize) => {
      expect(checkAvailabilityQuerySchema.safeParse({ ...validQuery, partySize }).success).toBe(
        false,
      );
    },
  );

  it('rejects a party size that is not a string, as query strings only carry strings', () => {
    expect(checkAvailabilityQuerySchema.safeParse({ ...validQuery, partySize: 6 }).success).toBe(
      false,
    );
  });

  it.each(['date', 'time', 'partySize'])('rejects a query without %s', (field) => {
    const query: Record<string, unknown> = { ...validQuery };
    delete query[field];
    expect(checkAvailabilityQuerySchema.safeParse(query).success).toBe(false);
  });

  it.each(['', '2026-13-01', '2026-02-30', '02/11/2026', '2026-1-5'])(
    'rejects the date "%s"',
    (date) => {
      expect(checkAvailabilityQuerySchema.safeParse({ ...validQuery, date }).success).toBe(false);
    },
  );

  it.each(['', '24:00', '12:60', '9:00', '12', '12:00:00'])('rejects the time "%s"', (time) => {
    expect(checkAvailabilityQuerySchema.safeParse({ ...validQuery, time }).success).toBe(false);
  });

  it('removes the fields it does not know', () => {
    const parsed = checkAvailabilityQuerySchema.parse({ ...validQuery, slotId: '3' });
    expect(parsed).toEqual({ date: '2026-11-02', time: '12:00', partySize: 6 });
  });

  // White-box: partySize goes through three stages, regex -> Number -> number checks.
  // Each case is stopped by a different stage, or passes all of them.
  describe('partySize pipeline (white-box)', () => {
    const partySizeIssue = (partySize: string) =>
      checkAvailabilityQuerySchema
        .safeParse({ ...validQuery, partySize })
        .error?.issues.find((issue) => issue.path[0] === 'partySize');

    it('stops at the regex, before the conversion, for a string that is not digits', () => {
      expect(partySizeIssue('1.5')?.message).toBe('Expected a whole number');
    });

    it('stops at positive() for a string of zeros, which the regex lets through', () => {
      expect(partySizeIssue('0')?.code).toBe('too_small');
      expect(partySizeIssue('000')?.code).toBe('too_small');
    });

    it('stops at max() for digits above the largest database integer', () => {
      expect(partySizeIssue(String(MAX_DB_INT + 1))?.code).toBe('too_big');
    });

    it('stops at max() for digits beyond the precision of a JavaScript number', () => {
      expect(partySizeIssue('99999999999999999999')?.code).toBe('too_big');
    });

    it('passes every stage with leading zeros, as Number ignores them', () => {
      expect(checkAvailabilityQuerySchema.parse({ ...validQuery, partySize: '007' })).toEqual({
        ...validQuery,
        partySize: 7,
      });
    });
  });
});
