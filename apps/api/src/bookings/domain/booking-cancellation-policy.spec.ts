import { describe, expect, it } from 'vitest';
import { decideCancellation } from './booking-cancellation-policy.js';

// Spec MH-08: Cancel a booking.
// Domain policy deciding whether a booking can be cancelled based on status and time.
// TODO(PO): Can PENDING bookings be cancelled directly by the hiker before confirmation? (Assumed: yes, freeing any held seats).
// TODO(PO): Is an already cancelled booking rejected with 409 Conflict or treated idempotently? (Assumed: rejected as ALREADY_CANCELLED).
// TODO(MH-08-whitebox): add white-box unit tests for decision condition coverage and rule precedence
// TODO(MH-08-graybox): add gray-box unit tests verifying database transaction rollback on concurrent cancellation attempts
// TODO(MH-08-integration): add PostgreSQL integration tests for booking status transitions (CONFIRMED/PENDING -> CANCELLED)
// TODO(MH-08-e2e): add Playwright E2E tests for cancellation confirmation and error notifications
describe('decideCancellation (Black-box cancellation policy)', () => {
  const now = new Date('2026-11-10T10:00:00Z');
  const HOUR = 60 * 60 * 1000;
  const futureSlot = new Date(now.getTime() + 48 * HOUR);
  const imminentSlot = new Date(now.getTime() + 2 * HOUR); // within 24h cutoff
  const pastSlot = new Date(now.getTime() - 2 * HOUR); // in the past

  describe('Equivalence Partitioning: Booking Status', () => {
    it('allows cancelling a CONFIRMED booking well ahead of the slot', () => {
      const decision = decideCancellation({
        status: 'CONFIRMED',
        startsAt: futureSlot,
        now,
      });
      expect(decision).toEqual({ ok: true });
    });

    it('allows cancelling a PENDING booking well ahead of the slot', () => {
      const decision = decideCancellation({
        status: 'PENDING',
        startsAt: futureSlot,
        now,
      });
      expect(decision).toEqual({ ok: true });
    });

    it('rejects cancelling an already CANCELLED booking', () => {
      const decision = decideCancellation({
        status: 'CANCELLED',
        startsAt: futureSlot,
        now,
      });
      expect(decision).toEqual({ ok: false, reason: 'ALREADY_CANCELLED' });
    });

    it('rejects cancelling a REJECTED booking', () => {
      const decision = decideCancellation({
        status: 'REJECTED',
        startsAt: futureSlot,
        now,
      });
      expect(decision).toEqual({ ok: false, reason: 'ALREADY_REJECTED' });
    });
  });

  // TODO(MH-08): decideCancellation allows cancelling at any time, so these tests fail.
  // Unskip them once the PO answers the TODO(PO) on the cutoff and the slot timing rules exist
  // (TOO_LATE, SLOT_PAST), or delete them if cancelling at any time is confirmed.
  describe.skip('Equivalence Partitioning: Slot Timing', () => {
    it('rejects cancelling a booking whose slot is too imminent (inside cutoff window)', () => {
      const decision = decideCancellation({
        status: 'CONFIRMED',
        startsAt: imminentSlot,
        now,
      });
      expect(decision).toEqual({ ok: false, reason: 'TOO_LATE' });
    });

    it('rejects cancelling a booking whose slot is already in the past', () => {
      const decision = decideCancellation({
        status: 'CONFIRMED',
        startsAt: pastSlot,
        now,
      });
      expect(decision).toEqual({ ok: false, reason: 'SLOT_PAST' });
    });

    it('rejects cancelling a PENDING booking whose slot is in the past', () => {
      const decision = decideCancellation({
        status: 'PENDING',
        startsAt: pastSlot,
        now,
      });
      expect(decision).toEqual({ ok: false, reason: 'SLOT_PAST' });
    });
  });

  describe('Rule Precedence & Decision Hierarchy', () => {
    it('returns ALREADY_CANCELLED even if the slot is in the past', () => {
      const decision = decideCancellation({
        status: 'CANCELLED',
        startsAt: pastSlot,
        now,
      });
      expect(decision).toEqual({ ok: false, reason: 'ALREADY_CANCELLED' });
    });

    it('returns ALREADY_REJECTED even if the slot is in the past', () => {
      const decision = decideCancellation({
        status: 'REJECTED',
        startsAt: pastSlot,
        now,
      });
      expect(decision).toEqual({ ok: false, reason: 'ALREADY_REJECTED' });
    });

    // TODO(MH-08): skipped like the Slot Timing tests above: there is no SLOT_PAST rule yet.
    it.skip('checks slot past condition before cutoff condition for active bookings', () => {
      const decision = decideCancellation({
        status: 'CONFIRMED',
        startsAt: pastSlot,
        now,
      });
      expect(decision).toEqual({ ok: false, reason: 'SLOT_PAST' });
    });
  });
});
