import { Injectable } from '@nestjs/common';
import type { ChangePasswordInput } from '@mountain-hut/shared';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { PasswordHasher, RefreshTokenRepository, UsersRepository } from './ports.js';
import { SessionIssuer } from './session-issuer.js';
import type { AuthSession } from './session-issuer.js';

// A logged in user sets a new password. It ends the forced change of an account created
// by the staff, and closes the other sessions: whoever knew the old password is logged out.
@Injectable()
export class ChangePassword {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: RefreshTokenRepository,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(userId: number, input: ChangePasswordInput): Promise<AuthSession> {
    const user = await this.users.findById(userId);
    if (!user) throw new DomainError('UNAUTHORIZED', 'Not authenticated');

    // Not UNAUTHORIZED: the session is valid, and the web app would try to refresh it.
    if (!(await this.passwords.compare(input.currentPassword, user.passwordHash))) {
      throw new DomainError('FORBIDDEN', 'Current password is wrong');
    }
    // The generated password must really be replaced.
    if (await this.passwords.compare(input.newPassword, user.passwordHash)) {
      throw new DomainError('UNPROCESSABLE', 'New password must be different from the current one');
    }

    await this.users.updatePassword(user.id, await this.passwords.hash(input.newPassword));
    await this.tokens.revokeAllForUser(user.id);
    return this.sessions.issue({
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: false,
    });
  }
}
