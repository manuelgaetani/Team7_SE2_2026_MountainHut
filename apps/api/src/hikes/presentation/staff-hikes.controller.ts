import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { StaffHike } from '@mountain-hut/shared';
import { AuthGuard } from '../../auth/presentation/auth.guard.js';
import { Roles } from '../../auth/presentation/roles.decorator.js';
import { RolesGuard } from '../../auth/presentation/roles.guard.js';
import { ListHikesForStaff } from '../application/list-hikes-for-staff.js';

// MH-20: the hikes registered by the hikers, for the hut staff (employee and warden).
@ApiTags('hikes')
@ApiCookieAuth()
@Controller('staff/hikes')
@UseGuards(AuthGuard, RolesGuard)
@Roles('EMPLOYEE', 'WARDEN')
export class StaffHikesController {
  constructor(private readonly hikes: ListHikesForStaff) {}

  @Get()
  list(): Promise<StaffHike[]> {
    return this.hikes.execute();
  }
}
