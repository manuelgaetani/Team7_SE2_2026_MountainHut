import { Module } from '@nestjs/common';
import { PasswordResetNotifier } from '../auth/application/ports.js';
import { BookingConfirmationNotifier } from '../bookings/application/booking-confirmation.port.js';
import { BookingConfirmationAdapter } from './infrastructure/booking-confirmation.adapter.js';
import { PasswordResetAdapter } from './infrastructure/password-reset.adapter.js';
import { Mailer, SmtpMailer } from './mailer.js';
import { NotificationService } from './notification.service.js';

// Import this module where emails must be sent (e.g. the bookings module): it exports
// NotificationService, the booking confirmation notifier and the password reset notifier.
@Module({
  providers: [
    NotificationService,
    { provide: Mailer, useClass: SmtpMailer },
    { provide: BookingConfirmationNotifier, useClass: BookingConfirmationAdapter },
    { provide: PasswordResetNotifier, useClass: PasswordResetAdapter },
  ],
  exports: [NotificationService, BookingConfirmationNotifier, PasswordResetNotifier],
})
export class NotificationsModule {}
