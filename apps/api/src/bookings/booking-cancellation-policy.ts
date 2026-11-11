import type { BookingStatus } from '../generated/prisma/client.js';

export type CancellationDecision =
  | { ok: true }
  | { ok: false; reason: 'TOO_LATE' | 'ALREADY_CANCELLED' | 'ALREADY_REJECTED' | 'SLOT_PAST' };

export interface BookingCancellationRequest {
  status: BookingStatus | 'CANCELLED';
  startsAt: Date;
  now: Date;
}

// TODO(MH-08): stub. Implement the logic tested in booking-cancellation-policy.spec.ts, then remove describe.skip there.
export const decideCancellation: (req: BookingCancellationRequest) => CancellationDecision = () => {
  throw new Error('Not implemented');
};

