import { describe, expect, it } from 'vitest';
import { decideCancellation } from './booking-cancellation-policy.js';

// Spec MH-08: Cancel a booking.
// Domain policy deciding whether a booking can be cancelled: by its status only, at any time.
// Decisions: a PENDING booking can be cancelled like a CONFIRMED one; cancelling a booking that is
// already cancelled is a conflict (ALREADY_CANCELLED), not an idempotent success.
// White-box cases: booking-cancellation-policy.whitebox.spec.ts. Database and HTTP flows:
// test/booking-cancel.int-spec.ts and e2e/tests/{api,web}/booking-cancel.spec.ts.
describe('decideCancellation (Black-box cancellation policy)', () => {
  const now = new Date('2026-11-10T10:00:00Z');
  const HOUR = 60 * 60 * 1000;
  const futureSlot = new Date(now.getTime() + 48 * HOUR);
  const imminentSlot = new Date(now.getTime() + 2 * HOUR);
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

  // Clarifications: a booking can be cancelled at any time, also once the slot has started.
  describe('Equivalence Partitioning: Slot Timing (no cutoff)', () => {
    it('allows cancelling a booking whose slot starts within the next hours', () => {
      const decision = decideCancellation({
        status: 'CONFIRMED',
        startsAt: imminentSlot,
        now,
      });
      expect(decision).toEqual({ ok: true });
    });

    it.each(['CONFIRMED', 'PENDING'] as const)(
      'allows cancelling a %s booking whose slot is already in the past',
      (status) => {
        const decision = decideCancellation({ status, startsAt: pastSlot, now });
        expect(decision).toEqual({ ok: true });
      },
    );
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
  });
});
