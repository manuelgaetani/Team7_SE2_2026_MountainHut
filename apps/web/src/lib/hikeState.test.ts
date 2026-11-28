import { describe, expect, it } from 'vitest';
import type { RegisteredHike } from '@mountain-hut/shared';
import { HIKE_STATE_LABEL, hikeState, nowMoment } from './hikeState.ts';

// MH-20: a hike leaving on Friday 27 November 2026 at 08:00 and back at 17:00, hut local time.
const hike = (patch: Partial<RegisteredHike> = {}): RegisteredHike => ({
  id: 1,
  destination: 'Monte Vettore',
  route: 'From Forca di Presta via Rifugio Zilioli',
  passagePoints: [],
  departureDate: '2026-11-27',
  departureTime: '08:00',
  returnDate: '2026-11-27',
  returnTime: '17:00',
  predefinedHikeId: null,
  ...patch,
});

describe('nowMoment', () => {
  it('writes the local date and time of a Date as a hike moment', () => {
    expect(nowMoment(new Date(2026, 10, 27, 14, 30))).toBe('2026-11-27T14:30');
  });

  it('pads single-digit months, days, hours and minutes with a zero', () => {
    expect(nowMoment(new Date(2026, 0, 5, 8, 5))).toBe('2026-01-05T08:05');
  });

  it('writes midnight as 00:00 of the new day', () => {
    expect(nowMoment(new Date(2026, 11, 31, 24, 0))).toBe('2027-01-01T00:00');
  });

  it('drops the seconds, so the whole minute is the same moment', () => {
    expect(nowMoment(new Date(2026, 10, 27, 8, 0, 59))).toBe('2026-11-27T08:00');
  });
});

describe('hikeState', () => {
  it('is Planned one minute before the departure', () => {
    expect(hikeState(hike(), '2026-11-27T07:59')).toBe('PLANNED');
  });

  it('is Planned on an earlier day, whatever the time', () => {
    expect(hikeState(hike(), '2026-11-26T23:59')).toBe('PLANNED');
  });

  // Issue #53: a hike has started at its planned departure.
  it('is Under way exactly at the departure', () => {
    expect(hikeState(hike(), '2026-11-27T08:00')).toBe('UNDER_WAY');
  });

  it('is Under way one minute before the expected return', () => {
    expect(hikeState(hike(), '2026-11-27T16:59')).toBe('UNDER_WAY');
  });

  it('is Past exactly at the expected return', () => {
    expect(hikeState(hike(), '2026-11-27T17:00')).toBe('PAST');
  });

  it('is Past after the expected return', () => {
    expect(hikeState(hike(), '2026-12-01T09:00')).toBe('PAST');
  });

  it('stays Under way overnight on a hike that returns on a later day', () => {
    const twoDays = hike({ returnDate: '2026-11-28', returnTime: '12:00' });
    expect(hikeState(twoDays, '2026-11-27T23:30')).toBe('UNDER_WAY');
    expect(hikeState(twoDays, '2026-11-28T12:00')).toBe('PAST');
  });

  it('compares the moments, not the times alone, across the end of the year', () => {
    const newYear = hike({
      departureDate: '2026-12-31',
      departureTime: '22:00',
      returnDate: '2027-01-01',
      returnTime: '02:00',
    });
    expect(hikeState(newYear, '2026-12-31T21:59')).toBe('PLANNED');
    expect(hikeState(newYear, '2027-01-01T01:00')).toBe('UNDER_WAY');
    expect(hikeState(newYear, '2027-01-01T02:00')).toBe('PAST');
  });
});

describe('HIKE_STATE_LABEL', () => {
  it('names every state as the cards show it', () => {
    expect(HIKE_STATE_LABEL).toEqual({
      PLANNED: 'Planned',
      UNDER_WAY: 'Under way',
      PAST: 'Past',
    });
  });
});
