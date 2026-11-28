import { describe, expect, it } from 'vitest';
import { isMenuEditable } from './menu-policy.js';

// MH-10: the menu of a slot can be written, changed or deleted only before the slot starts.
// Boundary values around the start: one millisecond and one minute before are allowed, the
// start itself and every instant after it are refused.

const startsAt = new Date('2026-12-05T11:00:00.000Z');
const at = (offsetMs: number) => new Date(startsAt.getTime() + offsetMs);

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('isMenuEditable', () => {
  it.each([
    ['one day before the start', -DAY],
    ['one minute before the start', -MINUTE],
    ['one millisecond before the start', -1],
  ])('allows the change %s', (_label, offset) => {
    expect(isMenuEditable(startsAt, at(offset))).toBe(true);
  });

  it.each([
    ['exactly at the start', 0],
    ['one millisecond after the start', 1],
    ['one minute after the start', MINUTE],
    ['one day after the start (a slot in the past)', DAY],
  ])('refuses the change %s', (_label, offset) => {
    expect(isMenuEditable(startsAt, at(offset))).toBe(false);
  });

  it('compares instants, whatever time zone the dates were written in', () => {
    // 11:59 in Rome (UTC+1 in December) is 10:59 UTC: one minute before the start.
    expect(isMenuEditable(startsAt, new Date('2026-12-05T11:59:00.000+01:00'))).toBe(true);
    expect(isMenuEditable(startsAt, new Date('2026-12-05T12:00:00.000+01:00'))).toBe(false);
  });

  it('does not change the dates it is given', () => {
    const now = at(-MINUTE);
    isMenuEditable(startsAt, now);
    expect(startsAt.toISOString()).toBe('2026-12-05T11:00:00.000Z');
    expect(now.toISOString()).toBe('2026-12-05T10:59:00.000Z');
  });
});
