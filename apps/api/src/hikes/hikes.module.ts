import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HikesRepository } from './application/hikes.repository.port.js';
import { ListPredefinedHikes } from './application/list-predefined-hikes.js';
import { RegisterHike } from './application/register-hike.js';
import { PrismaHikesRepository } from './infrastructure/prisma-hikes.repository.js';
import { HikesController } from './presentation/hikes.controller.js';

// MH-20: hikes registered by the hikers before departure, and the hut's list of hikes.
@Module({
  imports: [AuthModule],
  controllers: [HikesController],
  providers: [
    RegisterHike,
    ListPredefinedHikes,
    { provide: HikesRepository, useClass: PrismaHikesRepository },
  ],
})
export class HikesModule {}
