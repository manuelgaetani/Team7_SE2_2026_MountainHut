import type { AuthUser } from '@mountain-hut/shared';

export function isStaff(user?: AuthUser | null): boolean {
  return user?.role === 'EMPLOYEE' || user?.role === 'WARDEN';
}
