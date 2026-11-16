import { describe, expect, it } from 'vitest';
import { MAX_REQUIREMENTS_COUNT, MAX_REQUIREMENTS_LENGTH } from './bookings.js';
import {
  createStaffBookingSchema,
  hikerSearchQuerySchema,
  newHikerAccountSchema,
  temporaryHikerSchema,
} from './hikers.js';

const MAX_DB_INT = 2_147_483_647;

const account = {
  fullName: 'Luca Bianchi',
  email: 'luca.bianchi@example.com',
  phone: '+39 333 456 7890',
};

const booking = { slotId: 1, partySize: 4 };

describe('hikerSearchQuerySchema', () => {
  it('accepts a search of at least two characters, trimmed', () => {
    expect(hikerSearchQuerySchema.parse({ search: '  Ro ' })).toEqual({ search: 'Ro' });
  });

  it.each(['', ' ', 'R', '  R  '])('rejects the search "%s"', (search) => {
    expect(hikerSearchQuerySchema.safeParse({ search }).success).toBe(false);
  });
});

describe('temporaryHikerSchema', () => {
  it('accepts only a name', () => {
    expect(temporaryHikerSchema.parse({ fullName: ' Luca Bianchi ' })).toEqual({
      fullName: 'Luca Bianchi',
    });
  });

  it('accepts a name and a phone', () => {
    expect(
      temporaryHikerSchema.safeParse({ fullName: 'Luca', phone: '333 456 7890' }).success,
    ).toBe(true);
  });

  it('rejects a hiker without a name', () => {
    expect(temporaryHikerSchema.safeParse({ phone: '333 456 7890' }).success).toBe(false);
  });

  it('rejects a name without letters', () => {
    expect(temporaryHikerSchema.safeParse({ fullName: '1234' }).success).toBe(false);
  });

  it.each(['abc', '123', '+39 12'])('rejects the phone "%s"', (phone) => {
    expect(temporaryHikerSchema.safeParse({ fullName: 'Luca', phone }).success).toBe(false);
  });
});

describe('newHikerAccountSchema', () => {
  it('accepts a full profile with notes and emergency contact', () => {
    const result = newHikerAccountSchema.safeParse({
      ...account,
      notes: 'Registered mountain guide',
      emergencyContact: 'Anna Bianchi · +39 333 987 6543',
    });
    expect(result.success).toBe(true);
  });

  it('removes a password: the API generates it', () => {
    expect(newHikerAccountSchema.parse({ ...account, password: 'secret123' })).toEqual(account);
  });

  it.each(['fullName', 'email', 'phone'])('rejects a profile without %s', (field) => {
    const profile: Record<string, unknown> = { ...account };
    delete profile[field];
    expect(newHikerAccountSchema.safeParse(profile).success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(newHikerAccountSchema.safeParse({ ...account, email: 'luca' }).success).toBe(false);
  });
});

describe('createStaffBookingSchema', () => {
  it('accepts a booking for an existing hiker', () => {
    const input = { ...booking, hiker: { kind: 'EXISTING', hikerId: 7 } };
    expect(createStaffBookingSchema.parse(input)).toEqual(input);
  });

  it('accepts a booking for a temporary hiker with several requirements', () => {
    const input = {
      ...booking,
      requirements: [
        { allergies: true, description: '1 vegan, peanut allergy' },
        { allergies: true, description: '1 shellfish allergy' },
        { allergies: false, description: '2 vegetarians' },
      ],
      hiker: { kind: 'TEMPORARY', fullName: 'Luca Bianchi' },
    };
    expect(createStaffBookingSchema.parse(input)).toEqual(input);
  });

  it('accepts an empty list of requirements', () => {
    const input = { ...booking, requirements: [], hiker: { kind: 'EXISTING', hikerId: 7 } };
    expect(createStaffBookingSchema.safeParse(input).success).toBe(true);
  });

  it('rejects the requirements as free text', () => {
    const input = {
      ...booking,
      requirements: '2 vegetarians',
      hiker: { kind: 'EXISTING', hikerId: 7 },
    };
    expect(createStaffBookingSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ['without the allergies flag', { description: '2 vegetarians' }],
    ['with an empty description', { allergies: false, description: '   ' }],
    [
      'with a too long description',
      { allergies: false, description: 'x'.repeat(MAX_REQUIREMENTS_LENGTH + 1) },
    ],
  ])('rejects a requirement %s', (_, requirement) => {
    const input = {
      ...booking,
      requirements: [requirement],
      hiker: { kind: 'EXISTING', hikerId: 7 },
    };
    expect(createStaffBookingSchema.safeParse(input).success).toBe(false);
  });

  it('rejects more requirements than the maximum', () => {
    const requirements = Array.from({ length: MAX_REQUIREMENTS_COUNT + 1 }, () => ({
      allergies: false,
      description: '1 vegetarian',
    }));
    const input = { ...booking, requirements, hiker: { kind: 'EXISTING', hikerId: 7 } };
    expect(createStaffBookingSchema.safeParse(input).success).toBe(false);
  });

  it('accepts a booking that creates a regular hiker', () => {
    const input = { ...booking, hiker: { kind: 'ACCOUNT', ...account } };
    expect(createStaffBookingSchema.parse(input)).toEqual(input);
  });

  it('rejects a booking without a hiker', () => {
    expect(createStaffBookingSchema.safeParse(booking).success).toBe(false);
  });

  it('rejects an unknown kind of hiker', () => {
    const input = { ...booking, hiker: { kind: 'GUEST', fullName: 'Luca' } };
    expect(createStaffBookingSchema.safeParse(input).success).toBe(false);
  });

  it('rejects a new regular hiker without an email', () => {
    const input = { ...booking, hiker: { kind: 'ACCOUNT', fullName: 'Luca', phone: '3334567890' } };
    expect(createStaffBookingSchema.safeParse(input).success).toBe(false);
  });

  it.each([0, -1, 1.5, MAX_DB_INT + 1, '7'])('rejects the hikerId %s', (hikerId) => {
    const input = { ...booking, hiker: { kind: 'EXISTING', hikerId } };
    expect(createStaffBookingSchema.safeParse(input).success).toBe(false);
  });

  it('rejects a party of zero people', () => {
    const input = { slotId: 1, partySize: 0, hiker: { kind: 'EXISTING', hikerId: 7 } };
    expect(createStaffBookingSchema.safeParse(input).success).toBe(false);
  });
});
