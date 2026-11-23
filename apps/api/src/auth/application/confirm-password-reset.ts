import { Injectable } from '@nestjs/common';
import type { ConfirmPasswordResetInput } from '@mountain-hut/shared';
import { DomainError } from '../../shared-kernel/domain-error.js';
import {
  PasswordHasher,
  PasswordResetTokenRepository,
  RefreshTokenGenerator,
  RefreshTokenRepository,
  UsersRepository,
} from './ports.js';

// MH-07: sets the new password with the code of the link. The link works once, and every
// session of the user is closed: whoever used the old password is logged out.
@Injectable()
export class ConfirmPasswordReset {
  constructor(
    private readonly resetTokens: PasswordResetTokenRepository,
    private readonly codes: RefreshTokenGenerator,
    private readonly users: UsersRepository,
    private readonly passwords: PasswordHasher,
    private readonly sessions: RefreshTokenRepository,
  ) {}

  async execute(input: ConfirmPasswordResetInput, now = new Date()): Promise<void> {
    // Using the link is atomic, so it works only once even with two requests at the same time.
    // If a later step fails, the link is spent and the user asks for a new one: the password
    // never changes without a valid link.
    const userId = await this.resetTokens.consume(this.codes.hash(input.token), now);
    if (userId === null) {
      throw new DomainError('UNPROCESSABLE', 'The link is invalid or has expired');
    }
    // The user has chosen their own password: a forced change is no longer needed.
    await this.users.updatePassword(userId, await this.passwords.hash(input.password));
    await this.sessions.revokeAllForUser(userId);
  }
}
