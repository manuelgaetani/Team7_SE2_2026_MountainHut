import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HikersRepository } from './application/hikers.repository.port.js';
import { SearchHikers } from './application/search-hikers.js';
import { PrismaHikersRepository } from './infrastructure/prisma-hikers.repository.js';
import { HikersController } from './presentation/hikers.controller.js';

// hiker profiles as the staff see them.
@Module({
  imports: [AuthModule],
  controllers: [HikersController],
  providers: [SearchHikers, { provide: HikersRepository, useClass: PrismaHikersRepository }],
  // the staff booking finds or creates the hiker.
  exports: [HikersRepository],
})
export class HikersModule {}
