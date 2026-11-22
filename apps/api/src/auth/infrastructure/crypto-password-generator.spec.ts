import { randomInt } from 'node:crypto';
import { changePasswordSchema } from '@mountain-hut/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CryptoPasswordGenerator } from './crypto-password-generator.js';

// The real randomInt by default; the white-box tests choose the draws.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomInt: vi.fn(actual.randomInt) };
});

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

// MH-07 (R6): the password of an account created by the staff, read to the hiker.
describe('CryptoPasswordGenerator', () => {
  const generator = new CryptoPasswordGenerator();
  const many = Array.from({ length: 500 }, () => generator.generate());

  afterEach(() => {
    // Back to the real randomInt given to vi.fn.
    vi.mocked(randomInt).mockReset();
  });

  describe('black-box', () => {
    it('has 3 groups of 4 characters, like "k7mq-x3tz-9pwa"', () => {
      for (const password of many)
        expect(password).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    });

    it('never uses the characters that are easy to confuse when read aloud', () => {
      for (const password of many) expect(password).not.toMatch(/[01oli]/);
    });

    it('always has a letter and a digit, so it passes the password rules', () => {
      for (const password of many) {
        expect(password).toMatch(/[a-z]/);
        expect(password).toMatch(/\d/);
        expect(
          changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: password }).success,
        ).toBe(true);
      }
    });

    it('gives a different password every time', () => {
      expect(new Set(many).size).toBe(many.length);
    });
  });

  describe('white-box', () => {
    it('draws every character from the 31 symbols with node:crypto', () => {
      vi.mocked(randomInt).mockClear();
      generator.generate();
      expect(randomInt).toHaveBeenCalledTimes(12);
      expect(randomInt).toHaveBeenCalledWith(31);
      expect(ALPHABET).toHaveLength(31);
    });

    it('maps the draws to the symbols, in order', () => {
      // 0 → 'a', 30 → '9', 22 → 'z', 23 → '2'.
      const draws = [0, 30, 22, 23, 0, 30, 22, 23, 0, 30, 22, 23];
      vi.mocked(randomInt).mockImplementation(() => draws.shift() as never);
      expect(generator.generate()).toBe('a9z2-a9z2-a9z2');
    });

    it.each([
      ['only letters', 0],
      ['only digits', 30],
    ])('draws again when the first password has %s', (_case, onlyDraw) => {
      // 12 draws of the same symbol, then 'a' and '2' alternated.
      let calls = 0;
      vi.mocked(randomInt).mockImplementation((() => {
        calls += 1;
        if (calls <= 12) return onlyDraw;
        return calls % 2 === 0 ? 23 : 0;
      }) as never);
      const password = generator.generate();
      expect(calls).toBe(24);
      expect(password).toBe('a2a2-a2a2-a2a2');
    });
  });
});
