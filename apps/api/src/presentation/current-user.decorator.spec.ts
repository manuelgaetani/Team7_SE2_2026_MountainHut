import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { currentUserFactory } from './current-user.decorator.js';

describe('CurrentUser', () => {
  it('returns the user the auth guard put on the request', () => {
    const user = { id: 7, email: 'a@b.c', role: 'HIKER' };
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;

    expect(currentUserFactory(undefined, context)).toBe(user);
  });
});
