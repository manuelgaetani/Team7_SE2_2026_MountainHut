import { Module } from '@nestjs/common';
import { BookingConfirmationNotifier } from '../bookings/application/booking-confirmation.port.js';
import { BookingConfirmationAdapter } from './infrastructure/booking-confirmation.adapter.js';
import { Mailer, SmtpMailer } from './mailer.js';
import { NotificationService } from './notification.service.js';

// Import this module where emails must be sent (e.g. the bookings module): it exports
// NotificationService and the booking confirmation notifier.
@Module({
  providers: [
    NotificationService,
    { provide: Mailer, useClass: SmtpMailer },
    { provide: BookingConfirmationNotifier, useClass: BookingConfirmationAdapter },
  ],
  exports: [NotificationService, BookingConfirmationNotifier],
})
export class NotificationsModule {}
