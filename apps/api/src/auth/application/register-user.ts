import { Injectable } from '@nestjs/common';
import type { AuthUser, RegisterInput } from '@mountain-hut/shared';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { PasswordHasher, UsersRepository } from './ports.js';

@Injectable()
export class RegisterUser {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordHasher,
  ) {}

  async execute(input: RegisterInput): Promise<AuthUser> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new DomainError('CONFLICT', 'Email already registered');

    const passwordHash = await this.passwords.hash(input.password);
    // Two concurrent registrations with the same email: the repository reports the conflict.
    return this.users.createWithHiker(input, passwordHash);
  }
}
