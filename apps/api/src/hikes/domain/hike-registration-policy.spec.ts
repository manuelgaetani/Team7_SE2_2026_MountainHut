import { describe, expect, it } from 'vitest';
import { decideHikeRegistration, localMoment } from './hike-registration-policy.js';

// MH-20 R5: a hike is registered only while its departure is still ahead, in the hut's time
// zone. A departure in the current minute has already come.

describe('localMoment', () => {
  it('gives the local date and time of Rome in winter (UTC+1)', () => {
    expect(localMoment(new Date('2026-01-15T07:30:00Z'), 'Europe/Rome')).toBe('2026-01-15T08:30');
  });

  it('gives the local date and time of Rome in summer (UTC+2)', () => {
    expect(localMoment(new Date('2026-07-15T06:30:00Z'), 'Europe/Rome')).toBe('2026-07-15T08:30');
  });

  it('moves to the next local day before UTC does', () => {
    expect(localMoment(new Date('2026-11-27T23:30:00Z'), 'Europe/Rome')).toBe('2026-11-28T00:30');
  });

  it('moves to the next local year at local midnight', () => {
    expect(localMoment(new Date('2026-12-31T23:00:00Z'), 'Europe/Rome')).toBe('2027-01-01T00:00');
  });

  it('writes midnight as 00, not 24', () => {
    expect(localMoment(new Date('2026-11-26T23:00:00Z'), 'Europe/Rome')).toBe('2026-11-27T00:00');
  });

  it('drops the seconds: the moment is to the minute', () => {
    expect(localMoment(new Date('2026-11-27T10:15:59.999Z'), 'UTC')).toBe('2026-11-27T10:15');
  });

  it('follows the switch to summer time (02:00 becomes 03:00 in Rome)', () => {
    expect(localMoment(new Date('2026-03-29T00:59:00Z'), 'Europe/Rome')).toBe('2026-03-29T01:59');
    expect(localMoment(new Date('2026-03-29T01:00:00Z'), 'Europe/Rome')).toBe('2026-03-29T03:00');
  });

  it('uses the time zone it is given', () => {
    const now = new Date('2026-11-27T12:00:00Z');
    expect(localMoment(now, 'UTC')).toBe('2026-11-27T12:00');
    expect(localMoment(now, 'America/New_York')).toBe('2026-11-27T07:00');
  });

  it('throws on an unknown time zone', () => {
    expect(() => localMoment(new Date(), 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('decideHikeRegistration', () => {
  const now = '2026-11-27T15:45';

  it('allows a departure one minute after now', () => {
    expect(decideHikeRegistration('2026-11-27T15:46', now)).toEqual({ ok: true });
  });

  it('allows a departure on a later day', () => {
    expect(decideHikeRegistration('2026-11-28T06:00', now)).toEqual({ ok: true });
  });

  it('refuses a departure in the current minute', () => {
    expect(decideHikeRegistration('2026-11-27T15:45', now)).toEqual({
      ok: false,
      reason: 'DEPARTURE_PASSED',
    });
  });

  it('refuses a departure one minute before now', () => {
    expect(decideHikeRegistration('2026-11-27T15:44', now)).toEqual({
      ok: false,
      reason: 'DEPARTURE_PASSED',
    });
  });

  it('refuses a departure on an earlier day, even at a later hour', () => {
    expect(decideHikeRegistration('2026-11-26T23:59', now).ok).toBe(false);
  });
});
