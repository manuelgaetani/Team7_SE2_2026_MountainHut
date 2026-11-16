import { Injectable } from '@nestjs/common';
import { RefreshTokenGenerator, RefreshTokenRepository } from './ports.js';

@Injectable()
export class Logout {
  constructor(
    private readonly tokens: RefreshTokenRepository,
    private readonly refreshTokens: RefreshTokenGenerator,
  ) {}

  async execute(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.tokens.revokeByHash(this.refreshTokens.hash(rawToken));
  }
}
