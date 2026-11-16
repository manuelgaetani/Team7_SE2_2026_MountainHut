import { Injectable } from '@nestjs/common';
import { BookingConfirmationNotifier } from '../../bookings/application/booking-confirmation.port.js';
import type { ConfirmationStatus } from '../../bookings/application/booking-confirmation.port.js';
import { fromDbDate, fromDbTime } from '../../infrastructure/prisma/db-time.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { NotificationService } from '../notification.service.js';

// Loads the recipient and the booking data itself, then sends the confirmation email.
@Injectable()
export class BookingConfirmationAdapter extends BookingConfirmationNotifier {
  constructor(
    private readonly context: TransactionContext,
    private readonly notifications: NotificationService,
  ) {
    super();
  }

  async notify(bookingId: number): Promise<ConfirmationStatus> {
    const row = await this.context.client().booking.findUnique({
      where: { id: bookingId },
      select: {
        partySize: true,
        requirements: true,
        hiker: {
          select: { fullName: true, userId: true, user: { select: { email: true } } },
        },
        slot: { select: { date: true, startTime: true, endTime: true } },
      },
    });
    if (!row) return 'SKIPPED';

    return this.notifications.sendBookingConfirmation(
      { userId: row.hiker.userId, email: row.hiker.user?.email ?? null },
      {
        bookingId,
        fullName: row.hiker.fullName,
        date: fromDbDate(row.slot.date),
        startTime: fromDbTime(row.slot.startTime),
        endTime: fromDbTime(row.slot.endTime),
        partySize: row.partySize,
        requirements: row.requirements,
      },
    );
  }
}
