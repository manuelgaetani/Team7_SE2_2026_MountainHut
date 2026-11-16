import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from '@mountain-hut/shared';
import { AccessTokenIssuer } from '../application/ports.js';

// Algorithm and lifetime come from the JwtModule registration (HS256, JWT_EXPIRES_IN).
@Injectable()
export class JwtAccessTokenIssuer extends AccessTokenIssuer {
  constructor(private readonly jwt: JwtService) {
    super();
  }

  sign(user: AuthUser): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role });
  }
}
