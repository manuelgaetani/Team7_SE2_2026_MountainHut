import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@mountain-hut/shared';
import { ROLES_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // A method-level @Roles overrides the one on the controller.
    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed || allowed.length === 0) return true;

    // req.user is set by AuthGuard, which must run first.
    const req = context.switchToHttp().getRequest<Request & { user?: { role?: Role } }>();
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenException('Operation not allowed for your role');
    }
    return true;
  }
}
