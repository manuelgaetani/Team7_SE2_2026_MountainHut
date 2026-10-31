import { describe, expect, it } from 'vitest';
import { allocateSeats } from './seat-allocation.js';
import type { TableFreeSeats } from './seat-allocation.js';

const table = (tableNumber: number, freeSeats: number): TableFreeSeats => ({
  tableNumber,
  freeSeats,
});

describe('allocateSeats', () => {
  describe('when the seats are not enough', () => {
    it('returns null without tables', () => {
      expect(allocateSeats([], 1)).toBeNull();
    });

    it('returns null when the party is one seat over the total', () => {
      expect(allocateSeats([table(1, 2), table(2, 3)], 6)).toBeNull();
    });

    it('returns null when every table is full', () => {
      expect(allocateSeats([table(1, 0), table(2, 0)], 1)).toBeNull();
    });

    it('does not let an overbooked table lower or raise the total', () => {
      expect(allocateSeats([table(1, -2), table(2, 3)], 4)).toBeNull();
    });
  });

  describe('when one table is enough', () => {
    it('fills a table that fits the party exactly', () => {
      expect(allocateSeats([table(1, 4)], 4)).toEqual([{ tableNumber: 1, assignedSeats: 4 }]);
    });

    it('picks the smallest table that fits', () => {
      expect(allocateSeats([table(1, 8), table(2, 4), table(3, 6)], 3)).toEqual([
        { tableNumber: 2, assignedSeats: 3 },
      ]);
    });

    it('skips the smaller tables that do not fit', () => {
      expect(allocateSeats([table(1, 2), table(2, 5)], 3)).toEqual([
        { tableNumber: 2, assignedSeats: 3 },
      ]);
    });

    it('breaks a tie on the free seats with the lowest table number', () => {
      expect(allocateSeats([table(5, 4), table(2, 4)], 3)).toEqual([
        { tableNumber: 2, assignedSeats: 3 },
      ]);
    });

    it('never picks a full table', () => {
      expect(allocateSeats([table(1, 0), table(2, 2)], 1)).toEqual([
        { tableNumber: 2, assignedSeats: 1 },
      ]);
    });
  });

  describe('when the party must be split', () => {
    it('uses every table when the total matches the party exactly', () => {
      expect(allocateSeats([table(1, 2), table(2, 3)], 5)).toEqual([
        { tableNumber: 2, assignedSeats: 3 },
        { tableNumber: 1, assignedSeats: 2 },
      ]);
    });

    it('fills the largest tables first and takes only the seats left from the last', () => {
      expect(allocateSeats([table(1, 2), table(2, 4), table(3, 3)], 6)).toEqual([
        { tableNumber: 2, assignedSeats: 4 },
        { tableNumber: 3, assignedSeats: 2 },
      ]);
    });

    it('stops as soon as the party is seated', () => {
      expect(allocateSeats([table(1, 4), table(2, 4), table(3, 4)], 6)).toEqual([
        { tableNumber: 1, assignedSeats: 4 },
        { tableNumber: 2, assignedSeats: 2 },
      ]);
    });

    it('breaks a tie on the free seats with the lowest table number', () => {
      expect(allocateSeats([table(7, 3), table(4, 3)], 5)).toEqual([
        { tableNumber: 4, assignedSeats: 3 },
        { tableNumber: 7, assignedSeats: 2 },
      ]);
    });

    it('never assigns seats on a full table', () => {
      expect(allocateSeats([table(1, 0), table(2, 2), table(3, 2)], 3)).toEqual([
        { tableNumber: 2, assignedSeats: 2 },
        { tableNumber: 3, assignedSeats: 1 },
      ]);
    });
  });

  it('does not reorder the tables of the caller', () => {
    const tables = [table(1, 2), table(2, 4), table(3, 3)];
    allocateSeats(tables, 6);
    expect(tables).toEqual([table(1, 2), table(2, 4), table(3, 3)]);
  });

  it('returns no assignment for an empty party without tables', () => {
    expect(allocateSeats([], 0)).toEqual([]);
  });
});
