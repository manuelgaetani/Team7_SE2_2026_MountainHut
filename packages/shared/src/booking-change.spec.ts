import { describe, expect, it } from 'vitest';
import { changeBookingSchema } from './bookings.js';

const MAX_DB_INT = 2_147_483_647;

// TODO(MH-06-whitebox): add white-box unit tests covering internal Zod validation pipelines and custom issue formatters
// TODO(MH-06-graybox): add gray-box schema tests verifying database schema column type alignments and constraints
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
      const res = changeBookingSchema.safeParse({ requirements: 'Gluten-free diet' });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ requirements: 'Gluten-free diet' });
    });

    it('accepts changing both slotId and partySize', () => {
      const res = changeBookingSchema.safeParse({ slotId: 10, partySize: 6 });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ slotId: 10, partySize: 6 });
    });

    it('accepts changing all fields simultaneously (date/time, party size, and requirements)', () => {
      const payload = { slotId: 15, partySize: 3, requirements: 'No nuts' };
      const res = changeBookingSchema.safeParse(payload);
      expect(res.success).toBe(true);
      expect(res.data).toEqual(payload);
    });

    it('accepts clearing requirements by passing null', () => {
      const res = changeBookingSchema.safeParse({ requirements: null });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ requirements: null });
    });

    it('trims whitespace from requirements', () => {
      const res = changeBookingSchema.parse({ requirements: '   vegan and dairy free   ' });
      expect(res.requirements).toBe('vegan and dairy free');
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
      const requirements = 'a'.repeat(500);
      const res = changeBookingSchema.safeParse({ requirements });
      expect(res.success).toBe(true);
    });

    it('rejects requirements exceeding 500 characters (501 chars)', () => {
      const requirements = 'a'.repeat(501);
      const res = changeBookingSchema.safeParse({ requirements });
      expect(res.success).toBe(false);
    });

    it('rejects requirements containing a NUL byte', () => {
      const res = changeBookingSchema.safeParse({ requirements: 'peanut\u0000allergy' });
      expect(res.success).toBe(false);
    });
  });
});
