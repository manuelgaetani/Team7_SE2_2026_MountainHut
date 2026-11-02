import { BadRequestException } from '@nestjs/common';
import { loginSchema } from '@mountain-hut/shared';
import { describe, expect, it } from 'vitest';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(loginSchema);

  it('returns the parsed value when the input is valid', () => {
    expect(pipe.transform({ email: ' Anna@Example.IT ', password: 'secret' })).toEqual({
      email: 'anna@example.it',
      password: 'secret',
    });
  });

  it('throws BadRequest with the validation issues when the input is invalid', () => {
    let error: unknown;
    try {
      pipe.transform({ email: 'not-an-email' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    const body = (error as BadRequestException).getResponse() as {
      message: string;
      issues: { path: PropertyKey[] }[];
    };
    expect(body.message).toBe('Invalid data');
    expect(body.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
  });

  it('throws BadRequest when the body is missing', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });
});
