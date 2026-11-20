import { describe, expect, it } from 'vitest';
import { MAX_DB_INT, localDateSchema, localTimeSchema } from './primitives.js';

// White-box tests of the building blocks shared by bookings.ts and slots.ts (MH-04 moved them
// here to break the circular import between the two modules).

describe('MAX_DB_INT', () => {
  it('is the largest value of a Postgres INTEGER', () => {
    expect(MAX_DB_INT).toBe(2 ** 31 - 1);
  });
});

describe('localDateSchema', () => {
  // The date passes when: regex matches AND the Date is valid AND it does not roll over.
  // MC/DC: each case below changes one condition and changes the outcome.
  it.each([
    ['all conditions true', '2026-11-02', true],
    ['regex false', '2026-1-05', false],
    ['regex true, Date invalid (month 13)', '2026-13-01', false],
    ['regex true, Date valid but rolled over (Feb 30 -> Mar 2)', '2026-02-30', false],
  ])('%s: "%s" -> %s', (_name, date, ok) => {
    expect(localDateSchema.safeParse(date).success).toBe(ok);
  });

  it.each(['2028-02-29', '2000-02-29', '2026-12-31', '2026-01-01'])(
    'accepts the real calendar date "%s"',
    (date) => {
      expect(localDateSchema.safeParse(date).success).toBe(true);
    },
  );

  it.each(['2026-02-29', '1900-02-29', '2026-04-31', '2026-00-10', '2026-01-00'])(
    'rejects the date "%s", which does not exist',
    (date) => {
      expect(localDateSchema.safeParse(date).success).toBe(false);
    },
  );

  it('gives the format message when the regex fails', () => {
    const result = localDateSchema.safeParse('02/11/2026');
    expect(result.error?.issues[0]?.message).toBe('Expected a date as YYYY-MM-DD');
  });

  it('gives the calendar message when the format is right but the day does not exist', () => {
    const result = localDateSchema.safeParse('2026-02-30');
    expect(result.error?.issues[0]?.message).toBe('Not a valid calendar date');
  });

  it('rejects a date with surrounding text, as the regex is anchored', () => {
    expect(localDateSchema.safeParse(' 2026-11-02').success).toBe(false);
    expect(localDateSchema.safeParse('2026-11-02T00:00').success).toBe(false);
  });
});

describe('localTimeSchema', () => {
  it.each(['00:00', '09:05', '19:59', '20:00', '23:59'])('accepts the time "%s"', (time) => {
    expect(localTimeSchema.safeParse(time).success).toBe(true);
  });

  // One case for each way out of the regex: hour 2x above 23, hour above 29, minutes above 59,
  // one-digit hour or minute, missing or extra parts.
  it.each(['24:00', '30:00', '12:60', '9:00', '12:5', '1200', '12:00:00', '-1:00', ''])(
    'rejects the time "%s"',
    (time) => {
      const result = localTimeSchema.safeParse(time);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('Expected a time as HH:MM');
    },
  );
});
