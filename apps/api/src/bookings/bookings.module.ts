import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsRepository } from './bookings.repository.js';
import { BookingsService } from './bookings.service.js';
import { SlotsController } from './slots.controller.js';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [BookingsController, SlotsController, AvailabilityController],
  providers: [BookingsService, BookingsRepository, AvailabilityService],
})
export class BookingsModule {}
