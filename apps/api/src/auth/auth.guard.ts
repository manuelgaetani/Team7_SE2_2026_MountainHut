import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Role } from '@mountain-hut/shared';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = (req.cookies as Record<string, string> | undefined)?.token;
    if (!token) throw new UnauthorizedException('Non autenticato');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: number; email: string; role: Role }>(
        token,
        { algorithms: ['HS256'] },
      );
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException('Non autenticato');
    }
  }
}
