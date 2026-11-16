import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@mountain-hut/shared';
import { isStaff } from './roles.ts';

const userWith = (role: AuthUser['role']) => ({ role }) as AuthUser;

describe('isStaff', () => {
  it('is true for employees and wardens', () => {
    expect(isStaff(userWith('EMPLOYEE'))).toBe(true);
    expect(isStaff(userWith('WARDEN'))).toBe(true);
  });
  it('is false for hikers and no user', () => {
    expect(isStaff(userWith('HIKER'))).toBe(false);
    expect(isStaff(null)).toBe(false);
    expect(isStaff(undefined)).toBe(false);
  });
});
