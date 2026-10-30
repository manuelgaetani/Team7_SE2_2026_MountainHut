import { Module } from '@nestjs/common';
import { Mailer, SmtpMailer } from './mailer.js';
import { NotificationService } from './notification.service.js';

// Import this module where emails must be sent (e.g. the bookings module) and inject
// NotificationService.
@Module({
  providers: [NotificationService, { provide: Mailer, useClass: SmtpMailer }],
  exports: [NotificationService],
})
export class NotificationsModule {}
