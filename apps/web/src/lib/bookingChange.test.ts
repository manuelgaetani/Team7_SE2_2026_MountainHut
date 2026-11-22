import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANGE_LEAD_HOURS, isChangeOpen } from './bookingChange.ts';

describe('isChangeOpen', () => {
  // Local time, like the slot dates and times of the hut.
  const now = new Date(2026, 10, 20, 12, 0);

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes the 48-hour lead window constant', () => {
    expect(CHANGE_LEAD_HOURS).toBe(48);
  });

  it('is open when the slot starts exactly 48 hours from now', () => {
    expect(isChangeOpen('2026-11-22', '12:00', now)).toBe(true);
  });

  it('is closed 1 millisecond inside the 48-hour window', () => {
    const inside = new Date(2026, 10, 20, 12, 0, 0, 1);
    expect(isChangeOpen('2026-11-22', '12:00', inside)).toBe(false);
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

  it('evaluates the 48-hour boundary across month and year rollover', () => {
    const dec30 = new Date(2026, 11, 30, 19, 0);
    expect(isChangeOpen('2027-01-01', '19:00', dec30)).toBe(true);
    expect(isChangeOpen('2027-01-01', '18:59', dec30)).toBe(false);
  });

  it('uses the current system time when now is omitted', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0));
    expect(isChangeOpen('2026-11-22', '12:00')).toBe(true);
    expect(isChangeOpen('2026-11-22', '11:59')).toBe(false);
  });
});
