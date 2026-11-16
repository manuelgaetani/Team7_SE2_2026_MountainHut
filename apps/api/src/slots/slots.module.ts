import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SlotsRepository } from './application/slots.repository.port.js';
import { SlotsService } from './application/slots.service.js';
import { PrismaSlotsRepository } from './infrastructure/prisma-slots.repository.js';
import { SlotsController } from './slots.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [SlotsController],
  providers: [SlotsService, { provide: SlotsRepository, useClass: PrismaSlotsRepository }],
})
export class SlotsModule {}
