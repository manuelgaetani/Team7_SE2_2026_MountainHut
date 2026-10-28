import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './auth.js';

const validRegistration = {
  email: 'anna@example.it',
  password: 'password123',
  firstName: 'Anna',
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

  it.each(['email', 'password', 'firstName'])('rejects a registration without %s', (field) => {
    const input: Record<string, unknown> = { ...validRegistration };
    delete input[field];
    expect(registerSchema.safeParse(input).success).toBe(false);
  });

  it('rejects a password shorter than 8 characters and accepts exactly 8', () => {
    expect(registerSchema.safeParse({ ...validRegistration, password: '1234567' }).success).toBe(
      false,
    );
    expect(registerSchema.safeParse({ ...validRegistration, password: '12345678' }).success).toBe(
      true,
    );
  });

  it('accepts a password of exactly 72 bytes and rejects 73 bytes', () => {
    expect(
      registerSchema.safeParse({ ...validRegistration, password: 'a'.repeat(72) }).success,
    ).toBe(true);
    expect(
      registerSchema.safeParse({ ...validRegistration, password: 'a'.repeat(73) }).success,
    ).toBe(false);
  });

  it('measures the password limit in UTF-8 bytes, not characters', () => {
    // 'é' takes 2 bytes: 36 of them are 72 bytes, 37 are 74 bytes.
    expect(
      registerSchema.safeParse({ ...validRegistration, password: 'é'.repeat(36) }).success,
    ).toBe(true);
    expect(
      registerSchema.safeParse({ ...validRegistration, password: 'é'.repeat(37) }).success,
    ).toBe(false);
  });

  it('rejects a first name made only of spaces', () => {
    expect(registerSchema.safeParse({ ...validRegistration, firstName: '   ' }).success).toBe(
      false,
    );
  });

  it('accepts the optional last name and phone, trimmed', () => {
    const result = registerSchema.parse({
      ...validRegistration,
      lastName: ' Rossi ',
      phone: ' +39 333 1234567 ',
    });
    expect(result.lastName).toBe('Rossi');
    expect(result.phone).toBe('+39 333 1234567');
  });

  it('rejects an empty last name or phone when they are provided', () => {
    expect(registerSchema.safeParse({ ...validRegistration, lastName: ' ' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegistration, phone: '' }).success).toBe(false);
  });

  it('drops a role sent by the client, so nobody can self-register as staff', () => {
    const result = registerSchema.parse({ ...validRegistration, role: 'WARDEN' });
    expect(result).not.toHaveProperty('role');
  });
});

describe('loginSchema', () => {
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
