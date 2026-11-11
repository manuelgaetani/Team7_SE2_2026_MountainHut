// Standard cancellation notice: 24 hours prior to slot start (can be adjusted per PO specifications).
export const DEFAULT_CANCELLATION_CUTOFF_HOURS = 24;

// TODO(MH-08): stub. Implement the logic tested in booking-cancellation-cutoff.spec.ts, then remove describe.skip there.
export const isCancellationAdmitted: (startsAt: Date, now: Date) => boolean = () => {
  throw new Error('Not implemented');
};

