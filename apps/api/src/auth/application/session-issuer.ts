import { Injectable } from '@nestjs/common';
import type { AuthUser } from '@mountain-hut/shared';
import { AppConfig } from '../../config/app-config.js';
import { AccessTokenIssuer, RefreshTokenGenerator, RefreshTokenRepository } from './ports.js';

export interface AuthSession {
  token: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}

// Opens a session: a signed access token and a new refresh token, stored only as its hash.
@Injectable()
export class SessionIssuer {
  constructor(
    private readonly accessTokens: AccessTokenIssuer,
    private readonly refreshTokens: RefreshTokenGenerator,
    private readonly tokens: RefreshTokenRepository,
    private readonly config: AppConfig,
  ) {}

  async issue(user: AuthUser): Promise<AuthSession> {
    const token = await this.accessTokens.sign(user);
    const { raw, hash } = this.refreshTokens.generate();
    const refreshExpiresAt = new Date(Date.now() + this.config.refreshTtlMs);
    await this.tokens.create(user.id, hash, refreshExpiresAt);
    return { token, refreshToken: raw, refreshExpiresAt, user };
  }
}
