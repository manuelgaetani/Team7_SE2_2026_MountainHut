import { describe, expect, it } from 'vitest';
import { FILL_LABELS, LEGEND_LABELS, tableFill, takenLabel } from './tableFill.ts';

describe('tableFill', () => {
  it.each([
    [4, 0, 'free'],
    [4, 1, 'partial'],
    [4, 3, 'partial'],
    [4, 4, 'full'],
    [2, 3, 'full'],
  ] as const)('a table of %i seats with %i taken is %s', (capacity, taken, fill) => {
    expect(tableFill(capacity, taken)).toBe(fill);
  });

  it('says how many seats are taken', () => {
    expect(takenLabel(0, 4)).toBe('0/4 seats taken');
    expect(takenLabel(2, 2)).toBe('2/2 seats taken');
    expect(takenLabel(1, 4)).toBe('1/4 seat taken');
    expect(takenLabel(1, 1)).toBe('1/1 seat taken');
    expect(takenLabel(0, 1)).toBe('0/1 seats taken');
  });

  it('has a spoken label for every fill', () => {
    expect(FILL_LABELS).toEqual({ free: 'free', partial: 'partly taken', full: 'full' });
  });

  it('has a legend label for every fill', () => {
    expect(LEGEND_LABELS).toEqual({ free: 'Free', partial: 'Partly taken', full: 'Full' });
  });
});
