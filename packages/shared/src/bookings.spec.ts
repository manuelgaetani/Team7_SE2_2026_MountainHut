import { describe, expect, it } from 'vitest';
import { MAX_REQUIREMENT_LENGTH, MAX_REQUIREMENTS, createBookingSchema } from './bookings.js';

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

  it('accepts several requirements, with and without allergies', () => {
    const requirements = [
      { allergies: true, description: '1 vegan, peanut allergy' },
      { allergies: true, description: '1 shellfish allergy' },
      { allergies: false, description: '2 vegetarians' },
    ];
    expect(createBookingSchema.parse({ ...validBooking, requirements }).requirements).toEqual(
      requirements,
    );
  });

  it('trims the description of a requirement', () => {
    const parsed = createBookingSchema.parse({
      ...validBooking,
      requirements: [{ allergies: false, description: '  no nuts ' }],
    });
    expect(parsed.requirements?.[0].description).toBe('no nuts');
  });

  it('accepts a description up to the maximum length', () => {
    const description = 'a'.repeat(MAX_REQUIREMENT_LENGTH);
    const requirements = [{ allergies: false, description }];
    expect(createBookingSchema.safeParse({ ...validBooking, requirements }).success).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['too long', 'a'.repeat(MAX_REQUIREMENT_LENGTH + 1)],
    ['with a NUL byte', 'no\u0000nuts'],
    ['not a string', 5],
  ])('rejects a requirement with a description that is %s', (_label, description) => {
    const requirements = [{ allergies: false, description }];
    expect(createBookingSchema.safeParse({ ...validBooking, requirements }).success).toBe(false);
  });

  it.each([undefined, 'yes', 1, null])('rejects the allergies flag %j', (allergies) => {
    const requirements = [{ allergies, description: 'no nuts' }];
    expect(createBookingSchema.safeParse({ ...validBooking, requirements }).success).toBe(false);
  });

  it('accepts up to the maximum number of requirements, not more', () => {
    const one = { allergies: false, description: 'vegan' };
    const ok = Array.from({ length: MAX_REQUIREMENTS }, () => one);
    expect(createBookingSchema.safeParse({ ...validBooking, requirements: ok }).success).toBe(true);
    const tooMany = [...ok, one];
    expect(createBookingSchema.safeParse({ ...validBooking, requirements: tooMany }).success).toBe(
      false,
    );
  });

  it('rejects requirements that are not a list', () => {
    expect(
      createBookingSchema.safeParse({ ...validBooking, requirements: 'no nuts' }).success,
    ).toBe(false);
  });

  it.each([1, 100, 101, MAX_DB_INT])('accepts the partySize %d', (partySize) => {
    expect(createBookingSchema.safeParse({ ...validBooking, partySize }).success).toBe(true);
  });

  it.each([0, -1, 1.5, '2', null])('rejects the partySize %s', (partySize) => {
    expect(createBookingSchema.safeParse({ ...validBooking, partySize }).success).toBe(false);
  });
});
