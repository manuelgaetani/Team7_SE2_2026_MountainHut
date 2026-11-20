import { describe, expect, it } from 'vitest';
import { isChangeOpen } from './bookingChange.ts';

describe('isChangeOpen', () => {
  // Local time, like the slot dates and times of the hut.
  const now = new Date(2026, 10, 20, 12, 0);

  it('is open when the slot starts exactly 48 hours from now', () => {
    expect(isChangeOpen('2026-11-22', '12:00', now)).toBe(true);
  });

  it('is open when the slot starts later than 48 hours from now', () => {
    expect(isChangeOpen('2026-11-29', '19:30', now)).toBe(true);
  });

  it('is closed one minute before the 48 hours', () => {
    expect(isChangeOpen('2026-11-22', '11:59', now)).toBe(false);
  });

  it('is closed for a slot of tomorrow', () => {
    expect(isChangeOpen('2026-11-21', '19:00', now)).toBe(false);
  });

  it('is closed for a slot already started', () => {
    expect(isChangeOpen('2026-11-20', '11:00', now)).toBe(false);
  });
});
