import { describe, expect, it } from 'vitest';
import { fromIsoDate, isIsoDate, toIsoDate } from './dates.ts';

describe('isIsoDate', () => {
  it('accepts a real calendar date', () => {
    expect(isIsoDate('2026-11-04')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
  });

  it.each(['2026-02-31', '2026-13-01', '2026-11-4', '04/11/2026', '', 'today'])(
    'rejects "%s"',
    (value) => {
      expect(isIsoDate(value)).toBe(false);
    },
  );

  it.each([null, undefined, 20261104, {}])('rejects the non-string %s', (value) => {
    expect(isIsoDate(value)).toBe(false);
  });
});

describe('fromIsoDate and toIsoDate', () => {
  it('are the inverse of each other', () => {
    expect(toIsoDate(fromIsoDate('2026-11-04'))).toBe('2026-11-04');
  });
});
