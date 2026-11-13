import type { BookingStatus } from '../generated/prisma/client.js';

export type CancellationDecision =
  | { ok: true }
  | { ok: false; reason: 'ALREADY_CANCELLED' | 'ALREADY_REJECTED' };

export interface BookingCancellationRequest {
  status: BookingStatus;
  // Not used: MH-08 allows cancelling at any time. They stay optional so that the
  // existing spec, which passes them, still compiles.
  startsAt?: Date;
  now?: Date;
}

// Only a CONFIRMED or PENDING booking can be cancelled, whatever the time.
export function decideCancellation(req: BookingCancellationRequest): CancellationDecision {
  if (req.status === 'CANCELLED') return { ok: false, reason: 'ALREADY_CANCELLED' };
  if (req.status === 'REJECTED') return { ok: false, reason: 'ALREADY_REJECTED' };
  return { ok: true };
}