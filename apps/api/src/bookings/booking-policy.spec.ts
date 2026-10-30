import { describe, expect, it } from 'vitest';
import { MIN_LEAD_MS, decideBooking, isBookableInTime } from './booking-policy.js';

const now = new Date('2026-11-01T10:00:00Z');
const after = (ms: number) => new Date(now.getTime() + ms);

describe('MIN_LEAD_MS', () => {
  it('is two hours', () => {
    expect(MIN_LEAD_MS).toBe(7_200_000);
  });
});

describe('isBookableInTime', () => {
  it('accepts a slot starting exactly two hours from now', () => {
    expect(isBookableInTime(after(MIN_LEAD_MS), now)).toBe(true);
  });

  it('accepts a slot starting later than two hours from now', () => {
    expect(isBookableInTime(after(MIN_LEAD_MS + 1), now)).toBe(true);
  });

  it('rejects a slot starting one millisecond too soon', () => {
    expect(isBookableInTime(after(MIN_LEAD_MS - 1), now)).toBe(false);
  });

  it('rejects a slot starting now', () => {
    expect(isBookableInTime(now, now)).toBe(false);
  });

  it('rejects a slot already started', () => {
    expect(isBookableInTime(after(-1), now)).toBe(false);
  });
});

describe('decideBooking', () => {
  const tables = [{ tableNumber: 1, freeSeats: 4 }];
  const request = { startsAt: after(MIN_LEAD_MS), now, partySize: 2, tables };

  it('accepts the booking and returns the allocation', () => {
    expect(decideBooking(request)).toEqual({
      ok: true,
      allocation: [{ tableNumber: 1, assignedSeats: 2 }],
    });
  });

  it('rejects a booking made too late', () => {
    expect(decideBooking({ ...request, startsAt: after(MIN_LEAD_MS - 1) })).toEqual({
      ok: false,
      reason: 'TOO_LATE',
    });
  });

  it('rejects a party larger than the free seats', () => {
    expect(decideBooking({ ...request, partySize: 5 })).toEqual({
      ok: false,
      reason: 'NOT_ENOUGH_SEATS',
    });
  });

  it('checks the time before the seats', () => {
    const decision = decideBooking({ ...request, startsAt: now, partySize: 5 });
    expect(decision).toEqual({ ok: false, reason: 'TOO_LATE' });
  });
});
