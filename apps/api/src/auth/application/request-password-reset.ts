import { Injectable } from '@nestjs/common';
import { PASSWORD_RESET_TTL_HOURS } from '@mountain-hut/shared';
import type { RequestPasswordResetInput } from '@mountain-hut/shared';
import {
  PasswordResetNotifier,
  PasswordResetTokenRepository,
  RefreshTokenGenerator,
  UsersRepository,
} from './ports.js';

const HOUR_MS = 60 * 60 * 1000;

// MH-07: sends a link to set a new password, valid for 24 hours and only once
// (NIST SP 800-63A-4, section 3.8). The caller always gets the same answer, so it cannot tell
// whether the email is registered.
@Injectable()
export class RequestPasswordReset {
  constructor(
    private readonly users: UsersRepository,
    private readonly resetTokens: PasswordResetTokenRepository,
    // The same kind of random code as the refresh tokens: 32 random bytes, stored as SHA-256.
    private readonly codes: RefreshTokenGenerator,
    private readonly notifier: PasswordResetNotifier,
  ) {}

  async execute(input: RequestPasswordResetInput, now = new Date()): Promise<void> {
    const user = await this.users.findByEmail(input.email);
    if (!user) return;

    const { raw, hash } = this.codes.generate();
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_HOURS * HOUR_MS);
    await this.resetTokens.invalidateAllForUser(user.id);
    await this.resetTokens.create(user.id, hash, expiresAt);

    // Not awaited: the time taken by the SMTP server would reveal that the email exists.
    void this.notifier.send({ id: user.id, email: user.email }, raw, expiresAt);
  }
}
