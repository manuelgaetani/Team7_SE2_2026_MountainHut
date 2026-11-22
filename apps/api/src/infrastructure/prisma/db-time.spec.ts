import { describe, expect, it } from 'vitest';
import { fromDbDate, fromDbTime, toDbDate, toDbTime } from './db-time.js';

describe('db-time', () => {
  it('maps a local date to UTC midnight and back', () => {
    const date = toDbDate('2026-11-02');
    expect(date.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(fromDbDate(date)).toBe('2026-11-02');
  });

  it('maps a local time to 1970-01-01 UTC and back', () => {
    const time = toDbTime('19:30');
    expect(time.toISOString()).toBe('1970-01-01T19:30:00.000Z');
    expect(fromDbTime(time)).toBe('19:30');
  });

  it('drops the seconds when reading a time', () => {
    expect(fromDbTime(new Date('1970-01-01T08:05:59.000Z'))).toBe('08:05');
  });
});
