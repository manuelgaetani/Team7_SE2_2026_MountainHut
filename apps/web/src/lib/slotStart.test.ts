import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMenuEditable } from './slotStart.ts';

describe('isMenuEditable', () => {
  // Local time, like the slot dates and times of the hut.
  const now = new Date(2026, 10, 28, 12, 0);

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is open for a slot of a later day', () => {
    expect(isMenuEditable('2026-11-29', '12:00', now)).toBe(true);
  });

  it('is open one minute before the slot starts', () => {
    expect(isMenuEditable('2026-11-28', '12:01', now)).toBe(true);
  });

  it('is closed exactly when the slot starts', () => {
    expect(isMenuEditable('2026-11-28', '12:00', now)).toBe(false);
  });

  it('is closed 1 millisecond after the start', () => {
    const after = new Date(2026, 10, 28, 12, 0, 0, 1);
    expect(isMenuEditable('2026-11-28', '12:00', after)).toBe(false);
  });

  it('is closed while the slot is being served and after it', () => {
    expect(isMenuEditable('2026-11-28', '11:00', now)).toBe(false);
    expect(isMenuEditable('2026-11-27', '19:00', now)).toBe(false);
  });

  it('reads the start across month and year rollover', () => {
    const newYearsEve = new Date(2026, 11, 31, 23, 59);
    expect(isMenuEditable('2027-01-01', '00:00', newYearsEve)).toBe(true);
    expect(isMenuEditable('2026-12-31', '23:59', newYearsEve)).toBe(false);
  });

  it('uses the current system time when now is omitted', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 28, 12, 0));
    expect(isMenuEditable('2026-11-28', '12:01')).toBe(true);
    expect(isMenuEditable('2026-11-28', '12:00')).toBe(false);
  });
});
