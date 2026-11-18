import { describe, expect, it } from 'vitest';
import {
  PASSWORD_RESET_TTL_HOURS,
  changePasswordSchema,
  confirmPasswordResetSchema,
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
} from './auth.js';

const validRegistration = {
  email: 'anna@example.it',
  password: 'password123',
  fullName: 'Anna Rossi',
  phone: '3331234567',
};

describe('registerSchema', () => {
  it('accepts the minimal valid registration', () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true);
  });

  it('trims and lowercases the email', () => {
    const result = registerSchema.parse({ ...validRegistration, email: '  Anna@Example.IT ' });
    expect(result.email).toBe('anna@example.it');
  });

  it.each(['', 'anna', 'anna@', '@example.it', 'anna example@it'])(
    'rejects the invalid email "%s"',
    (email) => {
      expect(registerSchema.safeParse({ ...validRegistration, email }).success).toBe(false);
    },
  );

  it.each(['email', 'password', 'fullName', 'phone'])(
    'rejects a registration without %s',
    (field) => {
      const input: Record<string, unknown> = { ...validRegistration };
      delete input[field];
      expect(registerSchema.safeParse(input).success).toBe(false);
    },
  );

  it('rejects a password shorter than 8 characters and accepts exactly 8', () => {
    expect(registerSchema.safeParse({ ...validRegistration, password: 'abcdef1' }).success).toBe(
      false,
    );
    expect(registerSchema.safeParse({ ...validRegistration, password: 'abcdefg1' }).success).toBe(
      true,
    );
  });

  it('accepts a password of exactly 72 bytes and rejects 73 bytes', () => {
    expect(
      registerSchema.safeParse({ ...validRegistration, password: `1${'a'.repeat(71)}` }).success,
    ).toBe(true);
    expect(
      registerSchema.safeParse({ ...validRegistration, password: `1${'a'.repeat(72)}` }).success,
    ).toBe(false);
  });

  it('measures the password limit in UTF-8 bytes, not characters', () => {
    // 'é' takes 2 bytes: with two more characters, 35 of them are 72 bytes, 36 are 74 bytes.
    expect(
      registerSchema.safeParse({ ...validRegistration, password: `a1${'é'.repeat(35)}` }).success,
    ).toBe(true);
    expect(
      registerSchema.safeParse({ ...validRegistration, password: `a1${'é'.repeat(36)}` }).success,
    ).toBe(false);
  });

  it.each(['12345678', 'abcdefgh', '        ', '!!!!!!!!'])(
    'rejects the password "%s" without a letter and a digit',
    (password) => {
      expect(registerSchema.safeParse({ ...validRegistration, password }).success).toBe(false);
    },
  );

  it.each(['abcdefg1', 'pàssword1', 'pass word 1'])('accepts the password "%s"', (password) => {
    expect(registerSchema.safeParse({ ...validRegistration, password }).success).toBe(true);
  });

  it.each([
    'abc',
    '!!!',
    '333 abc 4567',
    '+',
    '++393331234567',
    '-3331234567',
    '123456',
    '1234567890123456',
  ])('rejects the phone "%s"', (phone) => {
    expect(registerSchema.safeParse({ ...validRegistration, phone }).success).toBe(false);
  });

  it.each(['1234567', '123456789012345', '3331234567', '+39 333 1234567', '+39-333-1234567'])(
    'accepts the phone "%s"',
    (phone) => {
      expect(registerSchema.safeParse({ ...validRegistration, phone }).success).toBe(true);
    },
  );

  it.each(['1', '123', '!!!'])('rejects the full name "%s" without letters', (fullName) => {
    expect(registerSchema.safeParse({ ...validRegistration, fullName }).success).toBe(false);
  });

  it('accepts a full name with accents and apostrophes', () => {
    const input = { ...validRegistration, fullName: "Nicolò D'Angelo" };
    expect(registerSchema.safeParse(input).success).toBe(true);
  });

  it.each(['fullName', 'notes', 'emergencyContact'])('rejects a NUL byte in %s', (field) => {
    const input = { ...validRegistration, [field]: 'Anna\u0000Rossi' };
    expect(registerSchema.safeParse(input).success).toBe(false);
  });

  it('rejects a full name or phone made only of spaces', () => {
    expect(registerSchema.safeParse({ ...validRegistration, fullName: '   ' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegistration, phone: '   ' }).success).toBe(false);
  });

  it('trims the full name and the phone', () => {
    const result = registerSchema.parse({
      ...validRegistration,
      fullName: ' Anna Rossi ',
      phone: ' +39 333 1234567 ',
    });
    expect(result.fullName).toBe('Anna Rossi');
    expect(result.phone).toBe('+39 333 1234567');
  });

  it('accepts the optional notes and emergency contact, trimmed', () => {
    const result = registerSchema.parse({
      ...validRegistration,
      notes: ' registered mountain guide ',
      emergencyContact: ' Marco Rossi 3339876543 ',
    });
    expect(result.notes).toBe('registered mountain guide');
    expect(result.emergencyContact).toBe('Marco Rossi 3339876543');
  });

  it('leaves notes and emergency contact undefined when omitted', () => {
    const result = registerSchema.parse(validRegistration);
    expect(result.notes).toBeUndefined();
    expect(result.emergencyContact).toBeUndefined();
  });

  it('drops a role sent by the client, so nobody can self-register as staff', () => {
    const result = registerSchema.parse({ ...validRegistration, role: 'WARDEN' });
    expect(result).not.toHaveProperty('role');
  });
});

describe('loginSchema', () => {
  it('accepts a password of exactly 72 bytes and rejects 73 bytes', () => {
    const login = (password: string) =>
      loginSchema.safeParse({ email: 'anna@example.it', password }).success;
    expect(login('a'.repeat(72))).toBe(true);
    expect(login('a'.repeat(73))).toBe(false);
  });

  it('does not apply the registration rules, so that older passwords keep working', () => {
    const input = { email: 'anna@example.it', password: 'aaaaaaaa' };
    expect(loginSchema.safeParse(input).success).toBe(true);
  });

  it('accepts an email and a password, normalizing the email', () => {
    const result = loginSchema.parse({ email: ' Anna@Example.IT', password: 'x' });
    expect(result).toEqual({ email: 'anna@example.it', password: 'x' });
  });

  it('rejects an empty password', () => {
    expect(loginSchema.safeParse({ email: 'anna@example.it', password: '' }).success).toBe(false);
  });

  it('rejects a missing or invalid email', () => {
    expect(loginSchema.safeParse({ password: 'password123' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'anna', password: 'password123' }).success).toBe(false);
  });
});

// MH-07 black box: password change and password recovery.

describe('changePasswordSchema', () => {
  const valid = { currentPassword: 'Generated1x', newPassword: 'MyOwnPass1' };

  it('accepts the current and a new password', () => {
    expect(changePasswordSchema.parse(valid)).toEqual(valid);
  });

  it('checks the current password only as a login does, so a generated one always passes', () => {
    expect(changePasswordSchema.safeParse({ ...valid, currentPassword: 'x' }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...valid, currentPassword: '' }).success).toBe(false);
    expect(
      changePasswordSchema.safeParse({ ...valid, currentPassword: 'a'.repeat(73) }).success,
    ).toBe(false);
  });

  it('applies the registration rules to the new password: 8 characters, a letter and a digit', () => {
    const withNew = (newPassword: string) =>
      changePasswordSchema.safeParse({ ...valid, newPassword }).success;
    expect(withNew('abcdef1')).toBe(false);
    expect(withNew('abcdefg1')).toBe(true);
    expect(withNew('abcdefgh')).toBe(false);
    expect(withNew('12345678')).toBe(false);
    expect(withNew(`1${'a'.repeat(71)}`)).toBe(true);
    expect(withNew(`1${'a'.repeat(72)}`)).toBe(false);
  });

  it.each(['currentPassword', 'newPassword'])('rejects a request without %s', (field) => {
    const input: Record<string, unknown> = { ...valid };
    delete input[field];
    expect(changePasswordSchema.safeParse(input).success).toBe(false);
  });
});

describe('requestPasswordResetSchema', () => {
  it('a reset link lasts 24 hours', () => {
    expect(PASSWORD_RESET_TTL_HOURS).toBe(24);
  });

  it('accepts an email and normalizes it', () => {
    expect(requestPasswordResetSchema.parse({ email: ' Anna@Example.IT ' })).toEqual({
      email: 'anna@example.it',
    });
  });

  it.each([{}, { email: '' }, { email: 'anna' }, { email: 'anna@' }])('rejects %j', (input) => {
    expect(requestPasswordResetSchema.safeParse(input).success).toBe(false);
  });
});

describe('confirmPasswordResetSchema', () => {
  const valid = { token: 'code-from-the-link', password: 'MyOwnPass1' };

  it('accepts the code of the link and a new password', () => {
    expect(confirmPasswordResetSchema.parse(valid)).toEqual(valid);
  });

  it('accepts a code of 1 and of 200 characters, rejects 0 and 201', () => {
    const withToken = (token: string) =>
      confirmPasswordResetSchema.safeParse({ ...valid, token }).success;
    expect(withToken('')).toBe(false);
    expect(withToken('a')).toBe(true);
    expect(withToken('a'.repeat(200))).toBe(true);
    expect(withToken('a'.repeat(201))).toBe(false);
  });

  it('applies the registration rules to the new password', () => {
    const withPassword = (password: string) =>
      confirmPasswordResetSchema.safeParse({ ...valid, password }).success;
    expect(withPassword('abcdef1')).toBe(false);
    expect(withPassword('abcdefgh')).toBe(false);
    expect(withPassword('abcdefg1')).toBe(true);
  });

  it.each(['token', 'password'])('rejects a request without %s', (field) => {
    const input: Record<string, unknown> = { ...valid };
    delete input[field];
    expect(confirmPasswordResetSchema.safeParse(input).success).toBe(false);
  });
});
