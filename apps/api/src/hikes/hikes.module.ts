import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HikesRepository } from './application/hikes.repository.port.js';
import { ListHikesForStaff } from './application/list-hikes-for-staff.js';
import { ListMyHikes } from './application/list-my-hikes.js';
import { ListPredefinedHikes } from './application/list-predefined-hikes.js';
import { RegisterHike } from './application/register-hike.js';
import { PrismaHikesRepository } from './infrastructure/prisma-hikes.repository.js';
import { HikesController } from './presentation/hikes.controller.js';
import { StaffHikesController } from './presentation/staff-hikes.controller.js';

// MH-20: hikes registered by the hikers before departure, the hut's list of hikes, and the
// registered hikes seen by the staff.
@Module({
  imports: [AuthModule],
  controllers: [HikesController, StaffHikesController],
  providers: [
    RegisterHike,
    ListPredefinedHikes,
    ListMyHikes,
    ListHikesForStaff,
    { provide: HikesRepository, useClass: PrismaHikesRepository },
  ],
})
export class HikesModule {}
