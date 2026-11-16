import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RefreshTokenGenerator } from '../application/ports.js';

@Injectable()
export class CryptoRefreshTokenGenerator extends RefreshTokenGenerator {
  generate(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hash(raw) };
  }

  // SHA-256 e non bcrypt: il token è già casuale e va cercato per uguaglianza.
  hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
