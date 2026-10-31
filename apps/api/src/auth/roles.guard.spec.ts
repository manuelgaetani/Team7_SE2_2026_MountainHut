import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@mountain-hut/shared';
import { describe, expect, it } from 'vitest';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

@Roles('EMPLOYEE', 'WARDEN')
class StaffController {
  list() {}

  @Roles('WARDEN')
  close() {}
}

class OpenController {
  list() {}
}

const contextFor = (
  controller: new () => object,
  handler: string,
  user?: { role?: Role },
): ExecutionContext =>
  ({
    getClass: () => controller,
    getHandler: () => (controller.prototype as Record<string, unknown>)[handler],
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it.each(['EMPLOYEE', 'WARDEN'] as const)('lets a %s use a staff route', (role) => {
    expect(guard.canActivate(contextFor(StaffController, 'list', { role }))).toBe(true);
  });

  it('forbids a hiker from using a staff route', () => {
    expect(() => guard.canActivate(contextFor(StaffController, 'list', { role: 'HIKER' }))).toThrow(
      ForbiddenException,
    );
  });

  it('forbids a request without user or role', () => {
    expect(() => guard.canActivate(contextFor(StaffController, 'list'))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(contextFor(StaffController, 'list', {}))).toThrow(
      ForbiddenException,
    );
  });

  it('lets the method-level roles override the controller-level ones', () => {
    expect(guard.canActivate(contextFor(StaffController, 'close', { role: 'WARDEN' }))).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(StaffController, 'close', { role: 'EMPLOYEE' })),
    ).toThrow(ForbiddenException);
  });

  it('allows any user on routes without @Roles', () => {
    expect(guard.canActivate(contextFor(OpenController, 'list', { role: 'HIKER' }))).toBe(true);
  });
});
