import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NotificationType } from '../generated/prisma/client.js';
import { Mailer } from './mailer.js';
import type { EmailContent } from './templates/booking-confirmation.js';
import { bookingConfirmationEmail } from './templates/booking-confirmation.js';
import type { BookingConfirmationData } from './templates/booking-confirmation.js';

export interface Recipient {
  userId: number;
  // Temporary hikers may have no email.
  email: string | null;
}

// SKIPPED: the hiker has no email, the staff contacts them by phone.
export type DeliveryStatus = 'SENT' | 'FAILED' | 'SKIPPED';

// Nodemailer throws an AggregateError with an empty message when no address of the SMTP host
// accepts the connection: the reasons are in the inner errors.
function errorMessage(err: unknown): string {
  if (err instanceof AggregateError && !err.message) {
    return err.errors.map(errorMessage).join('; ');
  }
  return err instanceof Error ? err.message : String(err);
}

// Sends the emails of the system and records each attempt in the `notifications` table.
//
// Call it only AFTER the database transaction has been committed: the methods never throw,
// so an SMTP problem can never undo a valid booking.
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly mailer: Mailer,
    private readonly prisma: PrismaService,
  ) {}

  sendBookingConfirmation(
    recipient: Recipient,
    booking: BookingConfirmationData,
  ): Promise<DeliveryStatus> {
    return this.deliver('BOOKING_CONFIRMATION', recipient, bookingConfirmationEmail(booking));
  }

  private async deliver(
    type: NotificationType,
    recipient: Recipient,
    content: EmailContent,
  ): Promise<DeliveryStatus> {
    if (!recipient.email) return 'SKIPPED';

    let status: 'SENT' | 'FAILED' = 'SENT';
    let error: string | null = null;
    try {
      await this.mailer.send({ to: recipient.email, ...content });
    } catch (err) {
      status = 'FAILED';
      error = errorMessage(err);
      this.logger.warn(`Email ${type} to user ${recipient.userId} not sent: ${error}`);
    }

    try {
      await this.prisma.notification.create({
        data: {
          type,
          recipient: recipient.email,
          subject: content.subject,
          status,
          error,
          userId: recipient.userId,
        },
      });
    } catch (err) {
      this.logger.error(`Email ${type} to user ${recipient.userId} not recorded`, err);
    }
    return status;
  }
}
