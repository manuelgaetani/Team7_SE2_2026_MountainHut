import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '@mountain-hut/shared';

// The user AuthGuard puts on the request after verifying the access token.
export interface AuthenticatedUser {
  id: number;
  email: string;
  role: Role;
}

export function currentUserFactory(_data: unknown, context: ExecutionContext): AuthenticatedUser {
  const req = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
  return req.user;
}

export const CurrentUser = createParamDecorator(currentUserFactory);
