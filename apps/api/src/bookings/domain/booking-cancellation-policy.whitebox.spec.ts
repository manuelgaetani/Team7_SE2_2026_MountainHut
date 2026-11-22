import { describe, expect, it } from 'vitest';
import { decideCancellation } from './booking-cancellation-policy.js';
import type { BookingCancellationRequest } from './booking-cancellation-policy.js';

// Spec MH-08: Cancel a booking.
// White-box tests of decideCancellation: one test per branch of its two conditions, plus the
// current rule that the start of the slot does not matter (MH-08 allows cancelling at any time).
describe('decideCancellation (White-box)', () => {
  const now = new Date('2026-11-10T10:00:00Z');
  const HOUR = 60 * 60 * 1000;

  describe('Branch coverage', () => {
    it('takes the first branch for CANCELLED and stops there', () => {
      expect(decideCancellation({ status: 'CANCELLED' })).toEqual({
        ok: false,
        reason: 'ALREADY_CANCELLED',
      });
    });

    it('skips the first branch and takes the second for REJECTED', () => {
      expect(decideCancellation({ status: 'REJECTED' })).toEqual({
        ok: false,
        reason: 'ALREADY_REJECTED',
      });
    });

    it.each(['CONFIRMED', 'PENDING'] as const)(
      'skips both branches and admits a %s booking',
      (status) => {
        expect(decideCancellation({ status })).toEqual({ ok: true });
      },
    );
  });

  describe('Decision table: status x slot timing', () => {
    const timings: [string, Partial<BookingCancellationRequest>][] = [
      ['no timing given', {}],
      ['slot in 10 days', { startsAt: new Date(now.getTime() + 240 * HOUR), now }],
      ['slot exactly 24 hours away', { startsAt: new Date(now.getTime() + 24 * HOUR), now }],
      ['slot in 1 hour', { startsAt: new Date(now.getTime() + HOUR), now }],
      ['slot starting now', { startsAt: now, now }],
      ['slot already started', { startsAt: new Date(now.getTime() - HOUR), now }],
    ];

    describe.each(timings)('with %s', (_label, timing) => {
      it.each(['CONFIRMED', 'PENDING'] as const)('admits a %s booking', (status) => {
        expect(decideCancellation({ status, ...timing })).toEqual({ ok: true });
      });

      it('rejects a CANCELLED booking', () => {
        expect(decideCancellation({ status: 'CANCELLED', ...timing })).toEqual({
          ok: false,
          reason: 'ALREADY_CANCELLED',
        });
      });

      it('rejects a REJECTED booking', () => {
        expect(decideCancellation({ status: 'REJECTED', ...timing })).toEqual({
          ok: false,
          reason: 'ALREADY_REJECTED',
        });
      });
    });
  });

  describe('Purity', () => {
    it('does not modify the request', () => {
      const startsAt = new Date(now.getTime() + HOUR);
      const req: BookingCancellationRequest = { status: 'CONFIRMED', startsAt, now };
      const copy = { ...req };
      decideCancellation(req);
      expect(req).toEqual(copy);
      expect(req.startsAt).toBe(startsAt);
    });

    it('returns a new decision object at each call', () => {
      const first = decideCancellation({ status: 'CONFIRMED' });
      const second = decideCancellation({ status: 'CONFIRMED' });
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
    });
  });
});
