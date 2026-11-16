import { Injectable } from '@nestjs/common';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { RefreshTokenGenerator, RefreshTokenRepository } from './ports.js';
import { SessionIssuer } from './session-issuer.js';
import type { AuthSession } from './session-issuer.js';

// Rotates the refresh token: the presented one is revoked and a new session is issued.
@Injectable()
export class RefreshSession {
  constructor(
    private readonly tokens: RefreshTokenRepository,
    private readonly refreshTokens: RefreshTokenGenerator,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(rawToken: string): Promise<AuthSession> {
    const stored = await this.tokens.findByHash(this.refreshTokens.hash(rawToken));
    if (!stored) throw new DomainError('UNAUTHORIZED', 'Invalid session');

    if (stored.revokedAt) {
      // Token già ruotato presentato di nuovo: possibile furto, chiudiamo tutte le sessioni.
      await this.tokens.revokeAllForUser(stored.userId);
      throw new DomainError('UNAUTHORIZED', 'Invalid session');
    }
    if (stored.expiresAt <= new Date()) {
      throw new DomainError('UNAUTHORIZED', 'Session expired');
    }

    // Revoca atomica: se due richieste usano lo stesso token, solo una vince.
    if (!(await this.tokens.revokeIfActive(stored.id))) {
      throw new DomainError('UNAUTHORIZED', 'Invalid session');
    }

    return this.sessions.issue({
      id: stored.user.id,
      email: stored.user.email,
      role: stored.user.role,
    });
  }
}
