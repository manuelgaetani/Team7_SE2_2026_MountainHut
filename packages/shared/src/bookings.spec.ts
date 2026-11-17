import { describe, expect, it } from 'vitest';
import { MAX_REQUIREMENTS_COUNT, createBookingSchema } from './bookings.js';

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

  it('accepts a booking with an empty list of requirements', () => {
    expect(createBookingSchema.safeParse({ ...validBooking, requirements: [] }).success).toBe(true);
  });

  it('trims the description of a requirement', () => {
    const parsed = createBookingSchema.parse({
      ...validBooking,
      requirements: [{ allergies: true, description: '  no nuts ' }],
    });
    expect(parsed.requirements).toEqual([{ allergies: true, description: 'no nuts' }]);
  });

  it('accepts a description up to the maximum length', () => {
    const requirements = [{ allergies: false, description: 'a'.repeat(500) }];
    expect(createBookingSchema.safeParse({ ...validBooking, requirements }).success).toBe(true);
  });

  it.each(['a'.repeat(501), 'no\u0000nuts', '', '   ', 5, null])(
    'rejects the description %j',
    (description) => {
      const requirements = [{ allergies: false, description }];
      expect(createBookingSchema.safeParse({ ...validBooking, requirements }).success).toBe(false);
    },
  );

  it.each(['yes', 1, null, undefined])('rejects the allergies flag %j', (allergies) => {
    const requirements = [{ allergies, description: 'no nuts' }];
    expect(createBookingSchema.safeParse({ ...validBooking, requirements }).success).toBe(false);
  });

  it('accepts requirements up to the maximum count', () => {
    const requirements = Array.from({ length: MAX_REQUIREMENTS_COUNT }, () => ({
      allergies: false,
      description: 'vegetarian',
    }));
    expect(createBookingSchema.safeParse({ ...validBooking, requirements }).success).toBe(true);
    const tooMany = [...requirements, requirements[0]];
    expect(createBookingSchema.safeParse({ ...validBooking, requirements: tooMany }).success).toBe(
      false,
    );
  });

  it.each(['no nuts', 5, null])('rejects requirements that are not a list: %j', (value) => {
    const parsed = createBookingSchema.safeParse({ ...validBooking, requirements: value });
    expect(parsed.success).toBe(false);
  });

  it.each(['description', 'allergies'])('rejects a requirement without %s', (field) => {
    const requirement: Record<string, unknown> = { allergies: true, description: 'no nuts' };
    delete requirement[field];
    const parsed = createBookingSchema.safeParse({ ...validBooking, requirements: [requirement] });
    expect(parsed.success).toBe(false);
  });

  it('rejects the whole list when one requirement is not valid', () => {
    const requirements = [
      { allergies: true, description: 'no nuts' },
      { allergies: false, description: '' },
    ];
    expect(createBookingSchema.safeParse({ ...validBooking, requirements }).success).toBe(false);
  });

  // The parsed requirements go as they are into the insert of the booking: a field such as
  // bookingId must never reach the database from the request.
  it('removes the fields of a requirement it does not know', () => {
    const parsed = createBookingSchema.parse({
      ...validBooking,
      requirements: [{ id: 7, bookingId: 99, allergies: true, description: 'no nuts' }],
    });
    expect(parsed.requirements).toEqual([{ allergies: true, description: 'no nuts' }]);
  });

  it('keeps the requirements in the order the hiker entered them', () => {
    const requirements = [
      { allergies: true, description: '1 vegan, peanut allergy' },
      { allergies: true, description: '1 shellfish allergy' },
      { allergies: false, description: '2 vegetarians' },
    ];
    expect(createBookingSchema.parse({ ...validBooking, requirements }).requirements).toEqual(
      requirements,
    );
  });

  it.each([1, 100, 101, MAX_DB_INT])('accepts the partySize %d', (partySize) => {
    expect(createBookingSchema.safeParse({ ...validBooking, partySize }).success).toBe(true);
  });

  it.each([0, -1, 1.5, '2', null])('rejects the partySize %s', (partySize) => {
    expect(createBookingSchema.safeParse({ ...validBooking, partySize }).success).toBe(false);
  });
});
