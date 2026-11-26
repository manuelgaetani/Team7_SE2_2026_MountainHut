import type { AuthUser } from '@mountain-hut/shared';

export function isStaff(user?: AuthUser | null): boolean {
  return user?.role === 'EMPLOYEE' || user?.role === 'WARDEN';
}

export const ROLE_LABEL: Record<AuthUser['role'], string> = {
  HIKER: 'Hiker',
  EMPLOYEE: 'Hut staff',
  WARDEN: 'Hut warden',
};
