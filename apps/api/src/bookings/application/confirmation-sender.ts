import { Injectable, Logger } from '@nestjs/common';
import { BookingConfirmationNotifier } from './booking-confirmation.port.js';
import { BookingsRepository } from './bookings.repository.port.js';

// Waits before each new attempt to send a failed confirmation email: 1 send + 3 retries.
// The retries live in this process only, so they are lost if the API restarts.
export const CONFIRMATION_RETRY_DELAYS_MS = [1_000, 5_000, 25_000];

// Waiting between two attempts, replaceable in tests.
export abstract class Sleeper {
  abstract sleep(ms: number): Promise<void>;
}

@Injectable()
export class TimerSleeper extends Sleeper {
  sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}

@Injectable()
export class ConfirmationSender {
  private readonly logger = new Logger(ConfirmationSender.name);

  constructor(
    private readonly notifier: BookingConfirmationNotifier,
    private readonly repo: BookingsRepository,
    private readonly sleeper: Sleeper,
  ) {}

  // Sends the confirmation email and, once it is sent, confirms the booking.
  // A failed email is retried after each delay of CONFIRMATION_RETRY_DELAYS_MS; after the last
  // failure, or when there is nothing to send (no email), the booking stays PENDING.
  // Never rejects: the booking is already stored, whatever happens to its email.
  async send(bookingId: number): Promise<void> {
    try {
      for (let attempt = 0; ; attempt++) {
        const status = await this.notifier.notify(bookingId);
        if (status === 'SENT') break;
        if (status !== 'FAILED' || attempt >= CONFIRMATION_RETRY_DELAYS_MS.length) return;
        await this.sleeper.sleep(CONFIRMATION_RETRY_DELAYS_MS[attempt]);
      }

      // Outside the loop: if confirming fails, the email must not be sent again.
      await this.repo.confirmBooking(bookingId);
    } catch (err) {
      this.logger.error(`Confirmation of booking ${bookingId} not completed`, err);
    }
  }
}
