import { Injectable } from '@nestjs/common';
import type { LoginInput } from '@mountain-hut/shared';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { PasswordHasher, UsersRepository } from './ports.js';
import { SessionIssuer } from './session-issuer.js';
import type { AuthSession } from './session-issuer.js';

@Injectable()
export class Login {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordHasher,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: LoginInput): Promise<AuthSession> {
    const user = await this.users.findByEmail(input.email);
    // Il confronto avviene sempre, così i tempi non rivelano se l'email è registrata.
    const matches = await this.passwords.compare(input.password, user?.passwordHash ?? null);
    if (!user || !matches) {
      throw new DomainError('UNAUTHORIZED', 'Invalid credentials');
    }
    return this.sessions.issue({ id: user.id, email: user.email, role: user.role });
  }
}
