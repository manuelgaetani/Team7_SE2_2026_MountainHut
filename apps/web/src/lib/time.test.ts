import { describe, expect, it } from 'vitest';
import { joinTime, normalizeTime, splitTime } from './time.ts';

describe('normalizeTime', () => {
  it.each([
    ['19:40', '19:40'],
    ['9:05', '09:05'],
    ['930', '09:30'],
    ['1940', '19:40'],
    ['19.5', '19:05'],
    ['7', '07:00'],
    [' 12:30 ', '12:30'],
    ['0:00', '00:00'],
  ])('reads %s as %s', (typed, time) => {
    expect(normalizeTime(typed)).toBe(time);
  });

  it.each(['', 'noon', '25:00', '12:60', '12345', '2400'])('leaves %s as typed', (typed) => {
    expect(normalizeTime(typed)).toBe(typed.trim());
  });
});

describe('splitTime and joinTime', () => {
  it('splits an HH:MM time and joins it back', () => {
    expect(splitTime('08:35')).toEqual({ hour: 8, minute: 35 });
    expect(splitTime('8:35')).toEqual({ hour: null, minute: null });
    expect(joinTime(8, 5)).toBe('08:05');
  });
});
