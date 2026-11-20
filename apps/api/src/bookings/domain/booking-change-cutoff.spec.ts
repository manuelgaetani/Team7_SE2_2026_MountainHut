import { describe, expect, it } from 'vitest';
import { CHANGE_LEAD_MS, isChangeAdmitted } from './booking-change-cutoff.js';

// Spec MH-06: Changes are admitted up to 48 hours before the booked slot (evaluated against hut
// local time Europe/Rome; exact 48-hour boundary included; course issue #43 applies to new slots).
describe('isChangeAdmitted (Black-box 48-hour cutoff)', () => {
  const slotStart = new Date('2026-11-20T12:00:00Z');
  const before = (ms: number) => new Date(slotStart.getTime() - ms);
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const CUTOFF_48H_MS = 48 * HOUR;

  it('accepts a change requested several days in advance (10 days)', () => {
    expect(isChangeAdmitted(slotStart, before(10 * 24 * HOUR))).toBe(true);
  });

  it('accepts a change requested 3 days in advance (72 hours)', () => {
    expect(isChangeAdmitted(slotStart, before(72 * HOUR))).toBe(true);
  });

  it('accepts a change requested 49 hours before the slot', () => {
    expect(isChangeAdmitted(slotStart, before(49 * HOUR))).toBe(true);
  });

  it('accepts a change requested exactly at the 48-hour boundary', () => {
    expect(isChangeAdmitted(slotStart, before(CUTOFF_48H_MS))).toBe(true);
  });

  it('rejects a change requested 1 millisecond after the 48-hour cutoff', () => {
    expect(isChangeAdmitted(slotStart, before(CUTOFF_48H_MS - 1))).toBe(false);
  });

  it('rejects a change requested 47 hours before the slot', () => {
    expect(isChangeAdmitted(slotStart, before(47 * HOUR))).toBe(false);
  });

  it('rejects a change requested 24 hours before the slot', () => {
    expect(isChangeAdmitted(slotStart, before(24 * HOUR))).toBe(false);
  });

  it('rejects a change requested 2 hours before the slot', () => {
    expect(isChangeAdmitted(slotStart, before(2 * HOUR))).toBe(false);
  });

  it('rejects a change requested at the exact slot start time', () => {
    expect(isChangeAdmitted(slotStart, slotStart)).toBe(false);
  });

  it('rejects a change requested after the slot has already started (in the past)', () => {
    expect(isChangeAdmitted(slotStart, before(-HOUR))).toBe(false);
  });

  it('correctly calculates the 48-hour boundary across midnight and date boundaries', () => {
    const midnightSlot = new Date('2026-11-20T00:00:00Z');
    const validTime = new Date('2026-11-18T00:00:00Z'); // exactly 48h
    const invalidTime = new Date('2026-11-18T00:01:00Z'); // 47h 59m

    expect(isChangeAdmitted(midnightSlot, validTime)).toBe(true);
    expect(isChangeAdmitted(midnightSlot, invalidTime)).toBe(false);
  });
});

describe('isChangeAdmitted (White-box branch, condition and MC/DC coverage)', () => {
  const base = new Date('2026-11-20T12:00:00Z');

  it('defines CHANGE_LEAD_MS as exactly 48 hours in milliseconds', () => {
    expect(CHANGE_LEAD_MS).toBe(48 * 60 * 60 * 1000);
  });

  it.each([
    ['delta === CHANGE_LEAD_MS + 1', CHANGE_LEAD_MS + 1, true],
    ['delta === CHANGE_LEAD_MS (boundary)', CHANGE_LEAD_MS, true],
    ['delta === CHANGE_LEAD_MS - 1', CHANGE_LEAD_MS - 1, false],
    ['delta === 0', 0, false],
    ['delta < 0 (past slot)', -1, false],
  ])('evaluates %s -> %s', (_label, deltaMs, expected) => {
    const now = new Date(base.getTime() - deltaMs);
    expect(isChangeAdmitted(base, now)).toBe(expected);
  });

  it('returns false when either or both Date inputs are Invalid Date (NaN)', () => {
    const invalid = new Date(Number.NaN);
    expect(isChangeAdmitted(invalid, base)).toBe(false);
    expect(isChangeAdmitted(base, invalid)).toBe(false);
    expect(isChangeAdmitted(invalid, invalid)).toBe(false);
  });

  it('compares instants identically regardless of explicit ISO offset formatting', () => {
    const romeSlot = new Date('2026-07-10T19:00:00+02:00');
    const utcCutoff = new Date('2026-07-08T17:00:00Z');
    const utcTooLate = new Date('2026-07-08T17:00:00.001Z');

    expect(isChangeAdmitted(romeSlot, utcCutoff)).toBe(true);
    expect(isChangeAdmitted(romeSlot, utcTooLate)).toBe(false);
  });
});

describe('isChangeAdmitted (Gray-box CET/CEST DST transitions across the 48-hour boundary)', () => {
  it('measures 48 real elapsed hours across the spring-forward transition (CET +01:00 -> CEST +02:00)', () => {
    // DST starts in Italy on Sunday 2026-03-29 at 02:00 CET -> 03:00 CEST (23-hour day).
    // Slot on 2026-03-30 12:00 CEST = 10:00 UTC; 48h earlier is 2026-03-28 10:00 UTC = 11:00 CET.
    const slotInCest = new Date('2026-03-30T12:00:00+02:00');
    const exact48h = new Date('2026-03-28T11:00:00+01:00');
    const oneMsInside = new Date('2026-03-28T11:00:00.001+01:00');
    const sameWallHour = new Date('2026-03-28T12:00:00+01:00'); // only 47 elapsed hours

    expect(isChangeAdmitted(slotInCest, exact48h)).toBe(true);
    expect(isChangeAdmitted(slotInCest, oneMsInside)).toBe(false);
    expect(isChangeAdmitted(slotInCest, sameWallHour)).toBe(false);
  });

  it('measures 48 real elapsed hours across the fall-back transition (CEST +02:00 -> CET +01:00)', () => {
    // DST ends in Italy on Sunday 2026-10-25 at 03:00 CEST -> 02:00 CET (25-hour day).
    // Slot on 2026-10-26 12:00 CET = 11:00 UTC; 48h earlier is 2026-10-24 11:00 UTC = 13:00 CEST.
    const slotInCet = new Date('2026-10-26T12:00:00+01:00');
    const sameWallHour = new Date('2026-10-24T12:00:00+02:00'); // 49 elapsed hours
    const exact48h = new Date('2026-10-24T13:00:00+02:00');
    const oneMsInside = new Date('2026-10-24T13:00:00.001+02:00');

    expect(isChangeAdmitted(slotInCet, sameWallHour)).toBe(true);
    expect(isChangeAdmitted(slotInCet, exact48h)).toBe(true);
    expect(isChangeAdmitted(slotInCet, oneMsInside)).toBe(false);
  });
});
