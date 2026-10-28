import { describe, expect, it } from 'vitest';
import { createBookingSchema } from './bookings.js';

const validBooking = { date: '2026-11-15', time: '12:30', partySize: 4 };

describe('createBookingSchema', () => {
  it('accepts a booking with date, time and party size', () => {
    expect(createBookingSchema.parse(validBooking)).toEqual(validBooking);
  });

  it.each(['date', 'time', 'partySize'])('rejects a booking without %s', (field) => {
    const input: Record<string, unknown> = { ...validBooking };
    delete input[field];
    expect(createBookingSchema.safeParse(input).success).toBe(false);
  });

  it('rejects a missing body', () => {
    expect(createBookingSchema.safeParse(undefined).success).toBe(false);
  });

  describe('date', () => {
    it.each(['2026-01-01', '2026-12-31', '2028-02-29'])('accepts the valid date "%s"', (date) => {
      expect(createBookingSchema.safeParse({ ...validBooking, date }).success).toBe(true);
    });

    it.each([
      '',
      'domani',
      '15/11/2026',
      '2026-11-5',
      '2026/11/15',
      '2026-13-01',
      '2026-00-10',
      '2026-11-00',
      '2026-11-31',
      '2026-02-30',
      '2027-02-29',
      '2026-11-15T12:30:00Z',
    ])('rejects the invalid date "%s"', (date) => {
      expect(createBookingSchema.safeParse({ ...validBooking, date }).success).toBe(false);
    });
  });

  describe('time', () => {
    it.each(['00:00', '09:05', '12:30', '23:59'])('accepts the valid time "%s"', (time) => {
      expect(createBookingSchema.safeParse({ ...validBooking, time }).success).toBe(true);
    });

    it.each(['', '12', '9:30', '12:5', '24:00', '12:60', '-1:00', '12:30:00', 'mezzogiorno'])(
      'rejects the invalid time "%s"',
      (time) => {
        expect(createBookingSchema.safeParse({ ...validBooking, time }).success).toBe(false);
      },
    );
  });

  describe('partySize', () => {
    it.each([1, 2, 50])('accepts a party of %d', (partySize) => {
      expect(createBookingSchema.safeParse({ ...validBooking, partySize }).success).toBe(true);
    });

    // TODO(PO): should a numeric string such as "4" be accepted and converted to a number?
    // For now it is rejected (no type coercion).
    it.each([0, -1, 2.5, Number.NaN, '4', null])('rejects the party size %s', (partySize) => {
      expect(createBookingSchema.safeParse({ ...validBooking, partySize }).success).toBe(false);
    });
  });
});
