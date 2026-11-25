import { describe, expect, it } from 'vitest';
import {
  MAX_REQUIREMENTS_COUNT,
  MAX_REQUIREMENTS_LENGTH,
  changeBookingSchema,
  type DietaryCode,
} from './bookings.js';
import { MAX_DB_INT } from './primitives.js';

// One entry of the MH-05 requirements list.
const need = (description: string, allergies = false) => ({
  restrictions: [] as DietaryCode[],
  allergies,
  description,
});

describe('changeBookingSchema (Black-box)', () => {
  describe('Equivalence Partitioning: Valid Change Payloads', () => {
    it('accepts changing only slotId (moving to another date/time slot)', () => {
      const res = changeBookingSchema.safeParse({ slotId: 42 });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ slotId: 42 });
    });

    it('accepts changing only partySize', () => {
      const res = changeBookingSchema.safeParse({ partySize: 5 });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ partySize: 5 });
    });

    it('accepts changing only requirements', () => {
      const res = changeBookingSchema.safeParse({ requirements: [need('Gluten-free diet')] });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ requirements: [need('Gluten-free diet')] });
    });

    it('accepts changing both slotId and partySize', () => {
      const res = changeBookingSchema.safeParse({ slotId: 10, partySize: 6 });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ slotId: 10, partySize: 6 });
    });

    it('accepts changing all fields simultaneously (date/time, party size, and requirements)', () => {
      const payload = { slotId: 15, partySize: 3, requirements: [need('No nuts', true)] };
      const res = changeBookingSchema.safeParse(payload);
      expect(res.success).toBe(true);
      expect(res.data).toEqual(payload);
    });

    it('accepts clearing requirements by passing an empty list', () => {
      const res = changeBookingSchema.safeParse({ requirements: [] });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ requirements: [] });
    });

    it('trims whitespace from requirements', () => {
      const res = changeBookingSchema.parse({
        requirements: [need('   vegan and dairy free   ')],
      });
      expect(res.requirements).toEqual([need('vegan and dairy free')]);
    });

    it('strips unrecognized extraneous fields', () => {
      const res = changeBookingSchema.parse({
        partySize: 4,
        hikerId: 999,
        status: 'CONFIRMED',
        extraField: 'unexpected',
      });
      expect(res).toEqual({ partySize: 4 });
    });
  });

  describe('Equivalence Partitioning: Mandatory Fields Check', () => {
    it('rejects an empty change payload with no fields to update', () => {
      const res = changeBookingSchema.safeParse({});
      expect(res.success).toBe(false);
      expect(res.error?.issues[0].message).toContain('At least one field');
    });

    it('rejects undefined input', () => {
      expect(changeBookingSchema.safeParse(undefined).success).toBe(false);
    });
  });

  describe('Boundary Value Analysis (BVA): slotId', () => {
    it.each([1, 2, 100, MAX_DB_INT])('accepts valid slotId boundary %d', (slotId) => {
      expect(changeBookingSchema.safeParse({ slotId }).success).toBe(true);
    });

    it.each([
      [0, 'zero'],
      [-1, 'negative'],
      [1.5, 'float'],
      [MAX_DB_INT + 1, 'above PostgreSQL integer maximum'],
      ['42', 'string number'],
      [null, 'null'],
    ])('rejects invalid slotId %s (%s)', (slotId, label) => {
      expect(changeBookingSchema.safeParse({ slotId }).success, label).toBe(false);
    });
  });

  describe('Boundary Value Analysis (BVA): partySize', () => {
    it.each([1, 2, 50, MAX_DB_INT])('accepts valid partySize boundary %d', (partySize) => {
      expect(changeBookingSchema.safeParse({ partySize }).success).toBe(true);
    });

    it.each([
      [0, 'zero'],
      [-1, 'negative'],
      [2.5, 'float'],
      ['4', 'string number'],
      [null, 'null'],
    ])('rejects invalid partySize %s (%s)', (partySize, label) => {
      expect(changeBookingSchema.safeParse({ partySize }).success, label).toBe(false);
    });
  });

  describe('Boundary Value Analysis (BVA): requirements', () => {
    it('accepts requirements at the exact maximum boundary of 500 characters', () => {
      const requirements = [need('a'.repeat(500))];
      const res = changeBookingSchema.safeParse({ requirements });
      expect(res.success).toBe(true);
    });

    it('rejects requirements exceeding 500 characters (501 chars)', () => {
      const requirements = [need('a'.repeat(501))];
      const res = changeBookingSchema.safeParse({ requirements });
      expect(res.success).toBe(false);
    });

    it('rejects requirements containing a NUL byte', () => {
      const res = changeBookingSchema.safeParse({ requirements: [need('peanut\u0000allergy')] });
      expect(res.success).toBe(false);
    });
  });
});

describe('changeBookingSchema (White-box Zod pipeline and issue formatting)', () => {
  it('rejects explicit undefined values for every optional field via refinement', () => {
    const res = changeBookingSchema.safeParse({
      slotId: undefined,
      partySize: undefined,
      requirements: undefined,
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]).toMatchObject({
      code: 'custom',
      message: 'At least one field (slotId, partySize, requirements) must be provided',
    });
  });

  it('reports field-specific issue paths for nested requirement and numeric errors', () => {
    const res = changeBookingSchema.safeParse({
      slotId: 0,
      partySize: -1,
      requirements: [need('   '), { restrictions: [], allergies: 'yes', description: 'vegan' }],
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues.map((i) => i.path)).toEqual(
      expect.arrayContaining([
        ['slotId'],
        ['partySize'],
        ['requirements', 0, 'description'],
        ['requirements', 1, 'allergies'],
      ]),
    );
  });

  it('enforces MAX_REQUIREMENTS_COUNT (20 accepted, 21 rejected)', () => {
    const atLimit = Array.from({ length: MAX_REQUIREMENTS_COUNT }, (_, i) => need(`req-${i}`));
    expect(changeBookingSchema.safeParse({ requirements: atLimit }).success).toBe(true);

    const overLimit = Array.from({ length: MAX_REQUIREMENTS_COUNT + 1 }, (_, i) =>
      need(`req-${i}`),
    );
    const res = changeBookingSchema.safeParse({ requirements: overLimit });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]).toMatchObject({
      code: 'too_big',
      path: ['requirements'],
    });
  });

  it('trims description before validating min/max length bounds', () => {
    expect(changeBookingSchema.safeParse({ requirements: [need('   ')] }).success).toBe(false);

    const exact = changeBookingSchema.parse({
      requirements: [need(`  ${'x'.repeat(MAX_REQUIREMENTS_LENGTH)}  `)],
    });
    expect(exact.requirements?.[0]?.description).toHaveLength(MAX_REQUIREMENTS_LENGTH);

    expect(
      changeBookingSchema.safeParse({
        requirements: [need(`  ${'x'.repeat(MAX_REQUIREMENTS_LENGTH + 1)}  `)],
      }).success,
    ).toBe(false);
  });

  it('rejects malformed requirement containers and strips unknown keys inside requirements', () => {
    for (const bad of ['no nuts', null, {}, [{ description: 'no nuts' }], [null]]) {
      expect(changeBookingSchema.safeParse({ requirements: bad }).success).toBe(false);
    }

    const stripped = changeBookingSchema.parse({
      requirements: [
        { restrictions: [], allergies: true, description: 'celiac', bookingId: 99, id: 1 },
      ],
    });
    expect(stripped.requirements).toEqual([
      { restrictions: [], allergies: true, description: 'celiac' },
    ]);
  });

  it('rejects non-finite and oversized partySize values', () => {
    for (const bad of [MAX_DB_INT + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(changeBookingSchema.safeParse({ partySize: bad }).success).toBe(false);
    }
  });
});

describe('changeBookingSchema (Gray-box PostgreSQL schema alignment)', () => {
  it('aligns slotId and partySize to signed 32-bit PostgreSQL INT4 bounds', () => {
    expect(changeBookingSchema.safeParse({ slotId: 1, partySize: 1 }).success).toBe(true);
    expect(
      changeBookingSchema.safeParse({ slotId: MAX_DB_INT, partySize: MAX_DB_INT }).success,
    ).toBe(true);
    expect(changeBookingSchema.safeParse({ slotId: MAX_DB_INT + 1 }).success).toBe(false);
    expect(changeBookingSchema.safeParse({ partySize: MAX_DB_INT + 1 }).success).toBe(false);
  });

  it('blocks NUL bytes anywhere in requirement descriptions while allowing UTF-8 text', () => {
    for (const withNul of ['\u0000vegan', 've\u0000gan', 'vegan\u0000']) {
      expect(changeBookingSchema.safeParse({ requirements: [need(withNul)] }).success).toBe(false);
    }

    const utf8 = changeBookingSchema.parse({
      requirements: [need('2 celiaci — menu senza glutine')],
    });
    expect(utf8.requirements).toEqual([
      { restrictions: [], allergies: false, description: '2 celiaci — menu senza glutine' },
    ]);
  });

  it('emits PartyRequirement items with exact non-nullable party_requirements column fields', () => {
    const parsed = changeBookingSchema.parse({
      requirements: [need('lactose free', true)],
    });
    expect(Object.keys(parsed.requirements![0]!).sort()).toEqual([
      'allergies',
      'description',
      'restrictions',
    ]);
  });
});
