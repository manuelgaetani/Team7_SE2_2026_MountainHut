import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { PasswordHasher } from '../application/ports.js';

const COST = 10;

@Injectable()
export class BcryptPasswordHasher extends PasswordHasher {
  // Computed on first use, not at import: it costs a full bcrypt round.
  private dummyHash?: string;

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, COST);
  }

  async compare(password: string, hash: string | null): Promise<boolean> {
    // Without an account we still compare, against a dummy hash with the same cost.
    const matches = await bcrypt.compare(password, hash ?? this.dummy());
    return hash !== null && matches;
  }

  private dummy(): string {
    this.dummyHash ??= bcrypt.hashSync('password-fittizia', COST);
    return this.dummyHash;
  }
}
