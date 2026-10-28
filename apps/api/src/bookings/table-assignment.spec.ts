import { describe, expect, it } from 'vitest';
import { assignTables, type FreeTable, type TableAssignment } from './table-assignment.js';

const tables = (...freeSeats: number[]): FreeTable[] =>
  freeSeats.map((seats, i) => ({ tableNumber: i + 1, freeSeats: seats }));

const tableNumbers = (result: TableAssignment[] | null) =>
  (result ?? []).map((a) => a.tableNumber).sort((a, b) => a - b);

// Properties every valid assignment must have, whatever the chosen tables.
const expectValidAssignment = (
  result: TableAssignment[] | null,
  available: FreeTable[],
  partySize: number,
) => {
  expect(result).not.toBeNull();
  const assignment = result as TableAssignment[];
  expect(assignment.reduce((sum, a) => sum + a.seats, 0)).toBe(partySize);
  expect(new Set(assignment.map((a) => a.tableNumber)).size).toBe(assignment.length);
  for (const a of assignment) {
    const table = available.find((t) => t.tableNumber === a.tableNumber);
    expect(table).toBeDefined();
    expect(a.seats).toBeGreaterThan(0);
    expect(a.seats).toBeLessThanOrEqual(table!.freeSeats);
  }
};

describe('assignTables', () => {
  describe('party fits at one table', () => {
    it('uses the only table when it fits exactly', () => {
      expect(assignTables(tables(4), 4)).toEqual([{ tableNumber: 1, seats: 4 }]);
    });

    it('chooses the smallest table that fits the whole party', () => {
      expect(assignTables(tables(6, 4, 8), 3)).toEqual([{ tableNumber: 2, seats: 3 }]);
    });

    it('seats a party of 1 at the smallest table', () => {
      expect(assignTables(tables(4, 2, 6), 1)).toEqual([{ tableNumber: 2, seats: 1 }]);
    });

    // TODO(PO): when one table can seat the whole party, must it always win over a split,
    // even if the split uses fewer seats (2+2 instead of a table of 6)?
    it('keeps the party together instead of splitting it over smaller tables', () => {
      expect(assignTables(tables(2, 2, 6), 4)).toEqual([{ tableNumber: 3, seats: 4 }]);
    });

    it('ignores tables with no free seats', () => {
      expect(assignTables(tables(0, 4), 3)).toEqual([{ tableNumber: 2, seats: 3 }]);
    });

    it('does not depend on the order of the tables', () => {
      const shuffled: FreeTable[] = [
        { tableNumber: 3, freeSeats: 8 },
        { tableNumber: 1, freeSeats: 6 },
        { tableNumber: 2, freeSeats: 4 },
      ];
      expect(assignTables(shuffled, 3)).toEqual([{ tableNumber: 2, seats: 3 }]);
    });
  });

  describe('party spread over more tables', () => {
    it('splits the party when no single table is big enough', () => {
      const available = tables(4, 4);
      const result = assignTables(available, 6);
      expectValidAssignment(result, available, 6);
      expect(tableNumbers(result)).toEqual([1, 2]);
    });

    it('uses as few tables as possible', () => {
      const available = tables(2, 2, 2, 6);
      const result = assignTables(available, 8);
      expectValidAssignment(result, available, 8);
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ tableNumber: 4, seats: 6 });
    });

    // TODO(PO): "smallest set of available seats" is read as: first the fewest tables, then
    // the fewest total seats. Is this the intended priority, or should seats come first?
    it('among the smallest sets of tables, uses the one with fewest seats', () => {
      // Pairs that fit 11: 4+10=14, 5+10=15, 6+10=16, 5+6=11.
      const available = tables(4, 5, 6, 10);
      const result = assignTables(available, 11);
      expectValidAssignment(result, available, 11);
      expect(tableNumbers(result)).toEqual([2, 3]);
    });

    it('prefers the smaller pair of tables over a larger one', () => {
      // Pairs that fit 9: 3+8=11, 5+8=13 (3+5=8 is too small).
      const available = tables(3, 5, 8);
      const result = assignTables(available, 9);
      expectValidAssignment(result, available, 9);
      expect(tableNumbers(result)).toEqual([1, 3]);
    });

    it('spreads the party over three tables when two are not enough', () => {
      const available = tables(2, 2, 2);
      const result = assignTables(available, 5);
      expectValidAssignment(result, available, 5);
      expect(result).toHaveLength(3);
    });

    // TODO(PO): the spec says the party "must be smaller than the seats available". Is a party
    // equal to the free seats accepted (<=, as tested here) or rejected (strict <)?
    it('fills every free seat when the party equals the total free seats', () => {
      expect(assignTables(tables(2, 3), 5)).toEqual(
        expect.arrayContaining([
          { tableNumber: 1, seats: 2 },
          { tableNumber: 2, seats: 3 },
        ]),
      );
    });
  });

  describe('party does not fit', () => {
    it('returns null when the party is larger than the total free seats', () => {
      expect(assignTables(tables(2, 3), 6)).toBeNull();
    });

    it('returns null when there are no tables', () => {
      expect(assignTables([], 1)).toBeNull();
    });

    it('returns null when every table is full', () => {
      expect(assignTables(tables(0, 0), 1)).toBeNull();
    });
  });

  it('does not modify the list of tables', () => {
    const available = tables(4, 5, 6, 10);
    const copy = structuredClone(available);
    assignTables(available, 11);
    expect(available).toEqual(copy);
  });

  it.each([
    [[4], 1],
    [[4, 4, 4], 9],
    [[2, 6, 3, 8], 12],
    [[10, 1, 1, 1], 13],
    [[5, 5, 5, 5], 20],
  ])('returns a valid assignment for tables %j and a party of %d', (freeSeats, partySize) => {
    const available = tables(...freeSeats);
    expectValidAssignment(assignTables(available, partySize), available, partySize);
  });
});
