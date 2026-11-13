import { describe, expect, it } from 'vitest';
import {
  MIN_LEAD_MS,
  checkAvailability,
  decideBooking,
  formatBreakdown,
  isBookableInTime,
  slotAvailability,
} from './booking-policy.js';

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

describe('slotAvailability', () => {
  it('is available with free seats and enough notice', () => {
    expect(slotAvailability(after(MIN_LEAD_MS), now, 1)).toBe('AVAILABLE');
  });

  it('is full without free seats', () => {
    expect(slotAvailability(after(MIN_LEAD_MS), now, 0)).toBe('FULL');
  });

  it('is too late less than two hours before the start, even when full', () => {
    expect(slotAvailability(after(MIN_LEAD_MS - 1), now, 0)).toBe('TOO_LATE');
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

describe('checkAvailability', () => {
  // 6 free seats split over 3 tables of 2: the example of MH-04.
  const tables = [
    { tableNumber: 1, freeSeats: 2 },
    { tableNumber: 2, freeSeats: 2 },
    { tableNumber: 3, freeSeats: 2 },
  ];
  const request = { startsAt: after(MIN_LEAD_MS), now, partySize: 6, tables };

  it('is available for a party of 6 over 3 tables of 2, with the seats of each table', () => {
    expect(checkAvailability(request)).toEqual({
      status: 'AVAILABLE',
      freeSeats: 6,
      allocation: [
        { tableNumber: 1, assignedSeats: 2 },
        { tableNumber: 2, assignedSeats: 2 },
        { tableNumber: 3, assignedSeats: 2 },
      ],
    });
  });

  it('is available when the party is exactly the free seats', () => {
    expect(checkAvailability({ ...request, partySize: 6 }).status).toBe('AVAILABLE');
  });

  it('has insufficient seats when the party is one over the free seats', () => {
    expect(checkAvailability({ ...request, partySize: 7 })).toEqual({
      status: 'INSUFFICIENT_SEATS',
      freeSeats: 6,
      allocation: null,
    });
  });

  it('has insufficient seats without tables', () => {
    expect(checkAvailability({ ...request, tables: [] })).toEqual({
      status: 'INSUFFICIENT_SEATS',
      freeSeats: 0,
      allocation: null,
    });
  });

  it('has insufficient seats when every table is full', () => {
    const full = [
      { tableNumber: 1, freeSeats: 0 },
      { tableNumber: 2, freeSeats: 0 },
    ];
    expect(checkAvailability({ ...request, tables: full, partySize: 1 })).toEqual({
      status: 'INSUFFICIENT_SEATS',
      freeSeats: 0,
      allocation: null,
    });
  });

  it('does not let an overbooked table lower the free seats', () => {
    const overbooked = [
      { tableNumber: 1, freeSeats: -2 },
      { tableNumber: 2, freeSeats: 3 },
    ];
    expect(checkAvailability({ ...request, tables: overbooked, partySize: 3 })).toEqual({
      status: 'AVAILABLE',
      freeSeats: 3,
      allocation: [{ tableNumber: 2, assignedSeats: 3 }],
    });
  });

  it('is available for a slot starting exactly two hours from now', () => {
    expect(checkAvailability({ ...request, startsAt: after(MIN_LEAD_MS) }).status).toBe(
      'AVAILABLE',
    );
  });

  it('is too late one millisecond before the two hours, but still shows the seats', () => {
    const check = checkAvailability({ ...request, startsAt: after(MIN_LEAD_MS - 1) });
    expect(check.status).toBe('TOO_LATE');
    expect(check.freeSeats).toBe(6);
    expect(check.allocation).toHaveLength(3);
  });

  it('is too late for a slot that has already started', () => {
    expect(checkAvailability({ ...request, startsAt: after(-1) }).status).toBe('TOO_LATE');
  });

  it('is too late, with no allocation, when the party does not fit either', () => {
    expect(
      checkAvailability({ ...request, startsAt: after(MIN_LEAD_MS - 1), partySize: 7 }),
    ).toEqual({ status: 'TOO_LATE', freeSeats: 6, allocation: null });
  });

  it.each([1, 4, 6, 7])('agrees with decideBooking for a party of %d', (partySize) => {
    const req = { ...request, partySize };
    expect(checkAvailability(req).status === 'AVAILABLE').toBe(decideBooking(req).ok);
  });
});

describe('formatBreakdown', () => {
  it('joins the seats of each table with a plus', () => {
    expect(formatBreakdown([2, 3, 1])).toBe('2 + 3 + 1 seats');
  });

  it('writes "seats" for several tables of the same size', () => {
    expect(formatBreakdown([2, 2, 2])).toBe('2 + 2 + 2 seats');
  });

  it('writes "seats" for one table with several seats', () => {
    expect(formatBreakdown([4])).toBe('4 seats');
  });

  it('writes "seat" for a single seat', () => {
    expect(formatBreakdown([1])).toBe('1 seat');
  });
});
