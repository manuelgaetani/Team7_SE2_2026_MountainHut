import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { isUniqueViolation } from './prisma-errors.js';

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test' });

describe('isUniqueViolation', () => {
  it('is true for P2002', () => expect(isUniqueViolation(known('P2002'))).toBe(true));
  it('is false for other Prisma codes', () =>
    expect(isUniqueViolation(known('P2025'))).toBe(false));
  it('is false for non-Prisma errors', () => {
    expect(isUniqueViolation(new Error('x'))).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
