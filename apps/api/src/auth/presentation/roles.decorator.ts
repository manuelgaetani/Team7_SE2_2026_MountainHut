import { SetMetadata } from '@nestjs/common';
import type { Role } from '@mountain-hut/shared';

export const ROLES_KEY = 'roles';

// Roles allowed to call a route or a whole controller. Use it together with
// @UseGuards(AuthGuard, RolesGuard): AuthGuard identifies the user, RolesGuard checks the role.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
