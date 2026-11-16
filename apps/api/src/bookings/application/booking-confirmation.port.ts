// Sends the confirmation of a stored booking. The implementation loads what it needs itself, so
// the bookings do not know about recipients, emails or templates.
// SKIPPED: nothing to send (the booking has disappeared or the hiker has no email).
export type ConfirmationStatus = 'SENT' | 'FAILED' | 'SKIPPED';

export abstract class BookingConfirmationNotifier {
  abstract notify(bookingId: number): Promise<ConfirmationStatus>;
}
