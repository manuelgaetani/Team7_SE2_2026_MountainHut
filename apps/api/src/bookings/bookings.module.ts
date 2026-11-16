import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { BookingsRepository } from './application/bookings.repository.port.js';
import { BookingsService } from './application/bookings.service.js';
import { BookingsController } from './bookings.controller.js';
import { PrismaBookingsRepository } from './infrastructure/prisma-bookings.repository.js';
import { SlotsController } from './slots.controller.js';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [BookingsController, SlotsController],
  providers: [BookingsService, { provide: BookingsRepository, useClass: PrismaBookingsRepository }],
})
export class BookingsModule {}
