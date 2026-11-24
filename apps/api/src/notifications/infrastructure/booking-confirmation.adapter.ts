import { Injectable } from '@nestjs/common';
import { BookingConfirmationNotifier } from '../../bookings/application/booking-confirmation.port.js';
import type { ConfirmationStatus } from '../../bookings/application/booking-confirmation.port.js';
import { fromDbDate, fromDbTime } from '../../infrastructure/prisma/db-time.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { NotificationService } from '../notification.service.js';
import type { Recipient } from '../notification.service.js';
import type { BookingConfirmationData } from '../templates/booking-confirmation.js';

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
    const data = await this.load(bookingId);
    if (!data) return 'SKIPPED';
    return this.notifications.sendBookingConfirmation(data.recipient, data.booking);
  }

  async notifyChange(bookingId: number): Promise<ConfirmationStatus> {
    const data = await this.load(bookingId);
    if (!data) return 'SKIPPED';
    return this.notifications.sendBookingChange(data.recipient, data.booking);
  }

  // The recipient and what the email shows. null if the booking does not exist or takes no seats
  // any more: a hiker who cancelled (MH-08), even during the retries, gets no confirmation or change.
  // A staff booking is CONFIRMED at once (MH-07) and still gets its confirmation.
  private async load(
    bookingId: number,
  ): Promise<{ recipient: Recipient; booking: BookingConfirmationData } | null> {
    const row = await this.context.client().booking.findUnique({
      where: { id: bookingId },
      select: {
        status: true,
        partySize: true,
        // In the order the hiker entered them (ids follow the insert order), only what the email shows.
        requirements: {
          select: { allergies: true, description: true },
          orderBy: { id: 'asc' },
        },
        hiker: {
          select: { fullName: true, userId: true, user: { select: { email: true } } },
        },
        slot: { select: { date: true, startTime: true, endTime: true } },
      },
    });
    if (!row || row.status === 'CANCELLED' || row.status === 'REJECTED') return null;

    return {
      recipient: { userId: row.hiker.userId, email: row.hiker.user?.email ?? null },
      booking: {
        bookingId,
        fullName: row.hiker.fullName,
        date: fromDbDate(row.slot.date),
        startTime: fromDbTime(row.slot.startTime),
        endTime: fromDbTime(row.slot.endTime),
        partySize: row.partySize,
        requirements: row.requirements,
      },
    };
  }
}
