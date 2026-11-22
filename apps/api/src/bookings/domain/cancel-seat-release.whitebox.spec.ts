import { describe, expect, it } from 'vitest';
import { releaseCancelledSeats } from './cancel-seat-release.js';
import type { SeatAllocation, TableFreeSeats } from './seat-allocation.js';

// Spec MH-08: Cancel a booking.
// White-box tests of releaseCancelledSeats: loop iterations (0, 1, many), the two defensive
// checks and their order, and purity also when a check fails midway.
describe('releaseCancelledSeats (White-box)', () => {
  const tables = (): TableFreeSeats[] => [
    { tableNumber: 1, freeSeats: 0 },
    { tableNumber: 2, freeSeats: 3 },
    { tableNumber: 5, freeSeats: 6 },
  ];

  describe('Loop coverage', () => {
    it('runs zero iterations on an empty slot with no assignments', () => {
      expect(releaseCancelledSeats([], [])).toEqual([]);
    });

    it('runs one iteration for a single assignment', () => {
      expect(releaseCancelledSeats(tables(), [{ tableNumber: 5, assignedSeats: 2 }])).toEqual([
        { tableNumber: 1, freeSeats: 0 },
        { tableNumber: 2, freeSeats: 3 },
        { tableNumber: 5, freeSeats: 8 },
      ]);
    });

    it('runs one iteration per assignment, in any order', () => {
      const assigned: SeatAllocation[] = [
        { tableNumber: 5, assignedSeats: 1 },
        { tableNumber: 1, assignedSeats: 4 },
        { tableNumber: 2, assignedSeats: 2 },
      ];
      expect(releaseCancelledSeats(tables(), assigned)).toEqual([
        { tableNumber: 1, freeSeats: 4 },
        { tableNumber: 2, freeSeats: 5 },
        { tableNumber: 5, freeSeats: 7 },
      ]);
    });

    it('adds up two assignments on the same table', () => {
      const assigned: SeatAllocation[] = [
        { tableNumber: 2, assignedSeats: 1 },
        { tableNumber: 2, assignedSeats: 2 },
      ];
      expect(releaseCancelledSeats(tables(), assigned)[1]).toEqual({
        tableNumber: 2,
        freeSeats: 6,
      });
    });
  });

  describe('Negative seats check', () => {
    it('accepts 0 assigned seats, the boundary of the check, and changes nothing', () => {
      expect(releaseCancelledSeats(tables(), [{ tableNumber: 1, assignedSeats: 0 }])).toEqual(
        tables(),
      );
    });

    it('rejects -1 assigned seats with an explicit message', () => {
      expect(() =>
        releaseCancelledSeats(tables(), [{ tableNumber: 1, assignedSeats: -1 }]),
      ).toThrow('The assigned seats cannot be negative');
    });

    it('checks the seats before looking for the table', () => {
      expect(() =>
        releaseCancelledSeats(tables(), [{ tableNumber: 99, assignedSeats: -1 }]),
      ).toThrow('The assigned seats cannot be negative');
    });
  });

  describe('Missing table check', () => {
    it('names the missing table in the message', () => {
      expect(() => releaseCancelledSeats(tables(), [{ tableNumber: 3, assignedSeats: 1 }])).toThrow(
        'Table 3 is not in the slot',
      );
    });

    it('rejects any assignment when the slot has no tables', () => {
      expect(() => releaseCancelledSeats([], [{ tableNumber: 1, assignedSeats: 1 }])).toThrow(
        'Table 1 is not in the slot',
      );
    });

    it('fails on a later assignment after the earlier ones were applied to the copy', () => {
      const assigned: SeatAllocation[] = [
        { tableNumber: 1, assignedSeats: 2 },
        { tableNumber: 4, assignedSeats: 2 },
      ];
      expect(() => releaseCancelledSeats(tables(), assigned)).toThrow('Table 4 is not in the slot');
    });
  });

  describe('Purity', () => {
    it('leaves the input tables untouched when a check fails midway', () => {
      const input = tables();
      expect(() =>
        releaseCancelledSeats(input, [
          { tableNumber: 1, assignedSeats: 2 },
          { tableNumber: 2, assignedSeats: -1 },
        ]),
      ).toThrow();
      expect(input).toEqual(tables());
    });

    it('does not modify the assignments', () => {
      const assigned: SeatAllocation[] = [{ tableNumber: 2, assignedSeats: 2 }];
      releaseCancelledSeats(tables(), assigned);
      expect(assigned).toEqual([{ tableNumber: 2, assignedSeats: 2 }]);
    });

    it('copies also the tables that are not part of the booking', () => {
      const input = tables();
      const released = releaseCancelledSeats(input, [{ tableNumber: 1, assignedSeats: 1 }]);
      released.forEach((table, i) => expect(table).not.toBe(input[i]));
    });
  });
});
