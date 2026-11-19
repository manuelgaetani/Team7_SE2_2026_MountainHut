import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PasswordGenerator } from '../application/ports.js';

// Lowercase letters and digits without the ones that are easy to confuse when read aloud
// (0/o, 1/l/i): 31 symbols, so 12 of them give about 59 bits of randomness.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const GROUPS = 3;
const GROUP_LENGTH = 4;

@Injectable()
export class CryptoPasswordGenerator extends PasswordGenerator {
  // Like "k7mq-x3tz-9pwa": groups of 4 are easier to dictate. The password rules want at least
  // a letter and a digit, so a draw without both is repeated.
  generate(): string {
    for (;;) {
      const chars = Array.from(
        { length: GROUPS * GROUP_LENGTH },
        () => ALPHABET[randomInt(ALPHABET.length)],
      );
      const password = Array.from({ length: GROUPS }, (_, g) =>
        chars.slice(g * GROUP_LENGTH, (g + 1) * GROUP_LENGTH).join(''),
      ).join('-');
      if (/\d/.test(password) && /[a-z]/.test(password)) return password;
    }
  }
}
