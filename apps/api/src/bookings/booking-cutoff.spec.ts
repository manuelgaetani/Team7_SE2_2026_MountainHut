import { describe, expect, it } from 'vitest';
import { isBookable } from './booking-cutoff.js';

// Spec MH-01: a hiker can reserve a seat up to 2 hours before the due time.
// TODO(PO): in which time zone are the slot date and time? The tests use absolute instants
// (UTC); turning Slot.date + Slot.startTime into an instant is left to the implementation.
describe('isBookable', () => {
  const slotStart = new Date('2026-11-15T12:30:00Z');
  const before = (ms: number) => new Date(slotStart.getTime() - ms);
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;

  it('accepts a booking made days in advance', () => {
    expect(isBookable(slotStart, before(3 * 24 * HOUR))).toBe(true);
  });

  it('accepts a booking made more than 2 hours before', () => {
    expect(isBookable(slotStart, before(2 * HOUR + MINUTE))).toBe(true);
  });

  // TODO(PO): is a booking made exactly 2 hours before the due time still allowed?
  // "Up to 2 hours before" is read as inclusive.
  it('accepts a booking made exactly 2 hours before', () => {
    expect(isBookable(slotStart, before(2 * HOUR))).toBe(true);
  });

  it('rejects a booking made 1 ms after the cutoff', () => {
    expect(isBookable(slotStart, before(2 * HOUR - 1))).toBe(false);
  });

  it('rejects a booking made less than 2 hours before', () => {
    expect(isBookable(slotStart, before(HOUR))).toBe(false);
  });

  it('rejects a booking at the start time of the slot', () => {
    expect(isBookable(slotStart, slotStart)).toBe(false);
  });

  it('rejects a booking for a slot already in the past', () => {
    expect(isBookable(slotStart, before(-HOUR))).toBe(false);
  });

  it('counts the cutoff across midnight', () => {
    const earlyMorning = new Date('2026-11-16T01:00:00Z');
    expect(isBookable(earlyMorning, new Date('2026-11-15T22:30:00Z'))).toBe(true);
    expect(isBookable(earlyMorning, new Date('2026-11-15T23:30:00Z'))).toBe(false);
  });
});
