import { describe, expect, it } from 'vitest';
import {
  MIN_HIKER_SEARCH_LENGTH,
  createStaffBookingSchema,
  hikerSearchQuerySchema,
  newHikerAccountSchema,
  staffBookingHikerSchema,
  temporaryHikerSchema,
} from './hikers.js';

// MH-07 black box: the cases come from the contract of the schemas (equivalence classes and
// boundary values), not from how they are written.

const MAX_DB_INT = 2_147_483_647;

const fullProfile = {
  email: 'anna@example.it',
  fullName: 'Anna Rossi',
  phone: '3331234567',
};

const booking = { slotId: 1, partySize: 2 };

describe('hikerSearchQuerySchema', () => {
  it('requires at least two characters', () => {
    expect(MIN_HIKER_SEARCH_LENGTH).toBe(2);
  });

  it('accepts a text of exactly the minimum length and rejects one character less', () => {
    expect(hikerSearchQuerySchema.safeParse({ search: 'ro' }).success).toBe(true);
    expect(hikerSearchQuerySchema.safeParse({ search: 'r' }).success).toBe(false);
  });

  it('counts the length after removing the spaces around the text', () => {
    expect(hikerSearchQuerySchema.safeParse({ search: '  r  ' }).success).toBe(false);
    expect(hikerSearchQuerySchema.parse({ search: '  rossi ' })).toEqual({ search: 'rossi' });
  });

  it.each([
    ['an empty text', { search: '' }],
    ['only spaces', { search: '     ' }],
    ['no search parameter', {}],
    ['a number instead of a text', { search: 12 }],
  ])('rejects %s', (_case, query) => {
    expect(hikerSearchQuerySchema.safeParse(query).success).toBe(false);
  });

  it.each(['Rossi', '333123', 'anna@example', '50%', 'a_b'])(
    'accepts a name, a phone, an email or special characters: "%s"',
    (search) => {
      expect(hikerSearchQuerySchema.safeParse({ search }).success).toBe(true);
    },
  );
});

describe('temporaryHikerSchema (quick entry)', () => {
  it('accepts only the full name', () => {
    expect(temporaryHikerSchema.parse({ fullName: 'Anna Rossi' })).toEqual({
      fullName: 'Anna Rossi',
    });
  });

  it('accepts a full name and a phone, both trimmed', () => {
    expect(temporaryHikerSchema.parse({ fullName: ' Anna Rossi ', phone: ' 3331234567 ' })).toEqual(
      { fullName: 'Anna Rossi', phone: '3331234567' },
    );
  });

  it('rejects a missing full name', () => {
    expect(temporaryHikerSchema.safeParse({ phone: '3331234567' }).success).toBe(false);
  });

  it.each(['', '   ', '123', 'Anna\u0000Rossi'])('rejects the full name "%s"', (fullName) => {
    expect(temporaryHikerSchema.safeParse({ fullName }).success).toBe(false);
  });

  it('applies the phone rules of the registration: 7 to 15 digits', () => {
    const withPhone = (phone: string) =>
      temporaryHikerSchema.safeParse({ fullName: 'Anna Rossi', phone }).success;
    expect(withPhone('123456')).toBe(false);
    expect(withPhone('1234567')).toBe(true);
    expect(withPhone('123456789012345')).toBe(true);
    expect(withPhone('1234567890123456')).toBe(false);
    expect(withPhone('abc')).toBe(false);
  });

  it('drops the fields of a full profile: a temporary hiker has no account', () => {
    const result = temporaryHikerSchema.parse({
      fullName: 'Anna Rossi',
      email: 'anna@example.it',
      password: 'password123',
    });
    expect(result).toEqual({ fullName: 'Anna Rossi' });
  });
});

describe('newHikerAccountSchema (full profile)', () => {
  it('accepts the same data as the web registration, without a password', () => {
    expect(newHikerAccountSchema.safeParse(fullProfile).success).toBe(true);
  });

  it('accepts notes and emergency contact', () => {
    const input = { ...fullProfile, notes: 'vegetarian', emergencyContact: 'Marco 3339876543' };
    expect(newHikerAccountSchema.parse(input)).toEqual(input);
  });

  it('normalizes the email', () => {
    const result = newHikerAccountSchema.parse({ ...fullProfile, email: ' Anna@Example.IT ' });
    expect(result.email).toBe('anna@example.it');
  });

  it('ignores a password sent by the client: the API generates it', () => {
    const result = newHikerAccountSchema.parse({ ...fullProfile, password: 'chosenByStaff1' });
    expect(result).not.toHaveProperty('password');
  });

  it('ignores a role sent by the client', () => {
    const result = newHikerAccountSchema.parse({ ...fullProfile, role: 'EMPLOYEE' });
    expect(result).not.toHaveProperty('role');
  });

  it.each(['email', 'fullName', 'phone'])('rejects a profile without %s', (field) => {
    const input: Record<string, unknown> = { ...fullProfile };
    delete input[field];
    expect(newHikerAccountSchema.safeParse(input).success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(newHikerAccountSchema.safeParse({ ...fullProfile, email: 'anna@' }).success).toBe(false);
  });
});

describe('staffBookingHikerSchema', () => {
  describe('EXISTING', () => {
    const existing = (hikerId: unknown) =>
      staffBookingHikerSchema.safeParse({ kind: 'EXISTING', hikerId }).success;

    it('accepts the ids 1 and the largest database integer', () => {
      expect(existing(1)).toBe(true);
      expect(existing(MAX_DB_INT)).toBe(true);
    });

    it.each([0, -1, 1.5, MAX_DB_INT + 1, '1', null])('rejects the hiker id %s', (hikerId) => {
      expect(existing(hikerId)).toBe(false);
    });

    it('rejects a missing hiker id', () => {
      expect(staffBookingHikerSchema.safeParse({ kind: 'EXISTING' }).success).toBe(false);
    });
  });

  describe('TEMPORARY', () => {
    it('accepts a name with or without a phone', () => {
      const parse = (input: object) =>
        staffBookingHikerSchema.safeParse({ kind: 'TEMPORARY', ...input }).success;
      expect(parse({ fullName: 'Anna Rossi' })).toBe(true);
      expect(parse({ fullName: 'Anna Rossi', phone: '3331234567' })).toBe(true);
    });

    it('rejects a temporary hiker without a name', () => {
      expect(staffBookingHikerSchema.safeParse({ kind: 'TEMPORARY' }).success).toBe(false);
    });
  });

  describe('ACCOUNT', () => {
    it('accepts a full profile', () => {
      expect(staffBookingHikerSchema.safeParse({ kind: 'ACCOUNT', ...fullProfile }).success).toBe(
        true,
      );
    });

    it('rejects a new account with only a name, as in a quick entry', () => {
      expect(
        staffBookingHikerSchema.safeParse({ kind: 'ACCOUNT', fullName: 'Anna Rossi' }).success,
      ).toBe(false);
    });
  });

  it.each([
    ['an unknown kind', { kind: 'GUEST', fullName: 'Anna Rossi' }],
    ['a lowercase kind', { kind: 'existing', hikerId: 1 }],
    ['no kind', { hikerId: 1 }],
  ])('rejects %s', (_case, input) => {
    expect(staffBookingHikerSchema.safeParse(input).success).toBe(false);
  });
});

describe('createStaffBookingSchema', () => {
  const forExisting = { ...booking, hiker: { kind: 'EXISTING', hikerId: 7 } };

  it('accepts a booking for each kind of hiker', () => {
    expect(createStaffBookingSchema.safeParse(forExisting).success).toBe(true);
    expect(
      createStaffBookingSchema.safeParse({
        ...booking,
        hiker: { kind: 'TEMPORARY', fullName: 'Anna Rossi' },
      }).success,
    ).toBe(true);
    expect(
      createStaffBookingSchema.safeParse({ ...booking, hiker: { kind: 'ACCOUNT', ...fullProfile } })
        .success,
    ).toBe(true);
  });

  it('rejects a booking without the hiker', () => {
    expect(createStaffBookingSchema.safeParse(booking).success).toBe(false);
  });

  it('keeps the rules of a hiker booking for slot and party size', () => {
    const parse = (input: object) =>
      createStaffBookingSchema.safeParse({ ...forExisting, ...input }).success;
    expect(parse({ slotId: 0 })).toBe(false);
    expect(parse({ slotId: MAX_DB_INT + 1 })).toBe(false);
    expect(parse({ partySize: 0 })).toBe(false);
    expect(parse({ partySize: 1 })).toBe(true);
    expect(parse({ partySize: 2.5 })).toBe(false);
  });

  // MH-05: the requirements are a list, one entry per part of the party.
  describe('requirements', () => {
    const entry = (description: string, allergies = false) => ({ allergies, description });
    const parse = (requirements: unknown) =>
      createStaffBookingSchema.safeParse({ ...forExisting, requirements });

    it('are optional', () => {
      expect(createStaffBookingSchema.parse(forExisting).requirements).toBeUndefined();
    });

    it('accept an empty list and a list of 20 entries, not 21', () => {
      expect(parse([]).success).toBe(true);
      expect(parse(Array.from({ length: 20 }, () => entry('vegetarian'))).success).toBe(true);
      expect(parse(Array.from({ length: 21 }, () => entry('vegetarian'))).success).toBe(false);
    });

    it('accept a description of 1 and of 500 characters, not 0 or 501', () => {
      expect(parse([entry('a')]).success).toBe(true);
      expect(parse([entry('a'.repeat(500))]).success).toBe(true);
      expect(parse([entry('')]).success).toBe(false);
      expect(parse([entry('a'.repeat(501))]).success).toBe(false);
    });

    it('trim the description', () => {
      expect(parse([entry('  1 nut allergy  ', true)]).data?.requirements).toEqual([
        entry('1 nut allergy', true),
      ]);
    });

    it('need the allergies flag', () => {
      expect(parse([{ description: 'vegetarian' }]).success).toBe(false);
    });

    it('reject the old free text of a single string', () => {
      expect(parse('gluten free').success).toBe(false);
    });
  });
});
