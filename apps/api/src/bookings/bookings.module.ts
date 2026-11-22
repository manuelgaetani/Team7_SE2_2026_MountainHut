import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AvailabilityService } from './application/availability.service.js';
import { BookingsRepository } from './application/bookings.repository.port.js';
import { BookingsService } from './application/bookings.service.js';
import { ConfirmationSender, Sleeper, TimerSleeper } from './application/confirmation-sender.js';
import { ListBookableSlots } from './application/list-bookable-slots.js';
import { ListMyBookings } from './application/list-my-bookings.js';
import { AvailabilityController } from './presentation/availability.controller.js';
import { BookingsController } from './presentation/bookings.controller.js';
import { PrismaBookingsRepository } from './infrastructure/prisma-bookings.repository.js';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [BookingsController, AvailabilityController],
  providers: [
    BookingsService,
    ListBookableSlots,
    ListMyBookings,
    AvailabilityService,
    ConfirmationSender,
    { provide: Sleeper, useClass: TimerSleeper },
    { provide: BookingsRepository, useClass: PrismaBookingsRepository },
  ],
  exports: [ListBookableSlots],
})
export class BookingsModule {}
