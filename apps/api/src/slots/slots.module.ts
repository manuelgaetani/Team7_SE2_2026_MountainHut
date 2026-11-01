import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SlotsController } from './slots.controller.js';
import { SlotsRepository } from './slots.repository.js';
import { SlotsService } from './slots.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SlotsController],
  providers: [SlotsService, SlotsRepository],
})
export class SlotsModule {}
