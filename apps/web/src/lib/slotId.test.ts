import { describe, expect, it } from 'vitest';
import { parseSlotId } from './slotId.ts';

describe('parseSlotId', () => {
  it.each([
    ['5', 5],
    ['2147483647', 2_147_483_647],
  ])('reads "%s" as %d', (raw, id) => {
    expect(parseSlotId(raw)).toBe(id);
  });

  it.each([undefined, '', '0', '-1', '1.5', 'abc', '05', '2147483648'])('refuses %s', (raw) => {
    expect(parseSlotId(raw)).toBeNull();
  });
});
