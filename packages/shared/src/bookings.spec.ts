import { describe, expect, it } from 'vitest';
import {
  checkAvailabilityQuerySchema,
  createBookingSchema,
  DIETARY_OPTIONS,
  hasAllergy,
  MAX_REQUIREMENTS_COUNT,
  partyRequirementSchema,
  requirementText,
} from './bookings.js';

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
      requirements: [{ restrictions: [], allergies: true, description: '  no nuts ' }],
    });
    expect(parsed.requirements).toEqual([
      { restrictions: [], allergies: true, description: 'no nuts' },
    ]);
  });

  it('accepts a description up to the maximum length', () => {
    const requirements = [{ restrictions: [], allergies: false, description: 'a'.repeat(500) }];
    expect(createBookingSchema.safeParse({ ...validBooking, requirements }).success).toBe(true);
  });

  it.each(['a'.repeat(501), 'no\u0000nuts', '', '   ', 5, null])(
    'rejects the description %j',
    (description) => {
      const requirements = [{ restrictions: [], allergies: false, description }];
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
    const requirement: Record<string, unknown> = {
      restrictions: [],
      allergies: true,
      description: 'no nuts',
    };
    delete requirement[field];
    const parsed = createBookingSchema.safeParse({ ...validBooking, requirements: [requirement] });
    expect(parsed.success).toBe(false);
  });

  it('rejects the whole list when one requirement is not valid', () => {
    const requirements = [
      { restrictions: [], allergies: true, description: 'no nuts' },
      { restrictions: [], allergies: false, description: '' },
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
    expect(parsed.requirements).toEqual([
      { restrictions: [], allergies: true, description: 'no nuts' },
    ]);
  });

  it('keeps the requirements in the order the hiker entered them', () => {
    const requirements = [
      { restrictions: [], allergies: true, description: '1 vegan, peanut allergy' },
      { restrictions: [], allergies: true, description: '1 shellfish allergy' },
      { restrictions: [], allergies: false, description: '2 vegetarians' },
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

// Issue from Team 16: the needs are picked from the list of the hut, with free text for the rest.
describe('partyRequirementSchema with the needs of the hut', () => {
  const parse = (value: unknown) => partyRequirementSchema.safeParse(value);

  it('lists each need once, with a code and a label', () => {
    const codes = DIETARY_OPTIONS.map((o) => o.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(DIETARY_OPTIONS.map((o) => o.label)).toEqual([
      'Gluten-free',
      'Lactose-free',
      'Egg-free',
      'Nut-free',
      'Soy-free',
      'Vegan',
    ]);
  });

  it('accepts listed needs without a description', () => {
    const parsed = parse({
      restrictions: ['GLUTEN_FREE', 'VEGAN'],
      allergies: false,
      description: '',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a description without listed needs, as older clients send it', () => {
    expect(parse({ allergies: true, description: 'shellfish' }).data).toEqual({
      restrictions: [],
      allergies: true,
      description: 'shellfish',
    });
  });

  it.each(['', '   '])('rejects an entry with no need and description %j', (description) => {
    expect(parse({ restrictions: [], allergies: false, description }).success).toBe(false);
  });

  it.each([['MEAT_FREE'], ['gluten_free'], [1]])('rejects the unknown need %j', (...codes) => {
    expect(parse({ restrictions: codes, allergies: false, description: '' }).success).toBe(false);
  });

  it('rejects the same need twice', () => {
    const restrictions = ['VEGAN', 'VEGAN'];
    expect(parse({ restrictions, allergies: false, description: '' }).success).toBe(false);
  });
});

describe('hasAllergy', () => {
  const need = (restrictions: string[], allergies: boolean, description: string) =>
    partyRequirementSchema.parse({ restrictions, allergies, description });

  it('is true for a listed allergen', () => {
    expect(hasAllergy(need(['LACTOSE_FREE'], false, ''))).toBe(true);
  });

  it('is false for vegan only, which is a choice and not an allergy', () => {
    expect(hasAllergy(need(['VEGAN'], false, ''))).toBe(false);
  });

  it('follows the flag of the free text', () => {
    expect(hasAllergy(need([], true, 'shellfish'))).toBe(true);
    expect(hasAllergy(need([], false, 'vegetarian'))).toBe(false);
  });

  it('ignores the flag when there is no free text', () => {
    expect(hasAllergy(need(['VEGAN'], true, ''))).toBe(false);
  });
});

describe('requirementText', () => {
  it('names the listed needs first, then the free text', () => {
    const r = partyRequirementSchema.parse({
      restrictions: ['GLUTEN_FREE', 'VEGAN'],
      allergies: true,
      description: 'shellfish',
    });
    expect(requirementText(r)).toBe('Gluten-free, Vegan, shellfish');
  });

  it('leaves out an empty description', () => {
    const r = partyRequirementSchema.parse({
      restrictions: ['EGG_FREE'],
      allergies: false,
      description: '',
    });
    expect(requirementText(r)).toBe('Egg-free');
  });
});
