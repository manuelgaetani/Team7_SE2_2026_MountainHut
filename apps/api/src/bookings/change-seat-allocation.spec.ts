import { describe, expect, it } from 'vitest';
import { canAccommodatePartyChange } from './change-seat-allocation.js';
import type { SeatAllocation, TableFreeSeats } from './seat-allocation.js';

const tables = (...freeSeats: number[]): TableFreeSeats[] =>
  freeSeats.map((seats, i) => ({ tableNumber: i + 1, freeSeats: seats }));

const expectValidAssignment = (
  result: SeatAllocation[] | null,
  available: TableFreeSeats[],
  partySize: number,
) => {
  expect(result).not.toBeNull();
  const assignment = result as SeatAllocation[];
  expect(assignment.reduce((sum, a) => sum + a.assignedSeats, 0)).toBe(partySize);
  expect(new Set(assignment.map((a) => a.tableNumber)).size).toBe(assignment.length);
  for (const a of assignment) {
    const table = available.find((t) => t.tableNumber === a.tableNumber);
    expect(table).toBeDefined();
    expect(a.assignedSeats).toBeGreaterThan(0);
    expect(a.assignedSeats).toBeLessThanOrEqual(table!.freeSeats);
  }
};

// Spec MH-06: Changes to party size are subject to the automatic verification of availability.
// TODO(PO): when party size increases, should the allocation prefer keeping current tables if possible,
// or reallocate entirely to minimize table fragmentation?
// TODO(MH-06-whitebox): add white-box unit tests covering internal heuristic branches and tie-breaker sorting
// TODO(MH-06-graybox): add gray-box tests verifying table assignment consistency with DB slot_tables
describe('canAccommodatePartyChange (Black-box automatic availability verification)', () => {
  describe('party fits at one table', () => {
    it('uses the single table when it fits the new party size exactly', () => {
      expect(canAccommodatePartyChange(tables(4), 4)).toEqual([
        { tableNumber: 1, assignedSeats: 4 },
      ]);
    });

    it('chooses the smallest available table that fits the updated party', () => {
      expect(canAccommodatePartyChange(tables(6, 4, 8), 3)).toEqual([
        { tableNumber: 2, assignedSeats: 3 },
      ]);
    });

    it('seats a reduced party of 1 at the smallest table', () => {
      expect(canAccommodatePartyChange(tables(4, 2, 6), 1)).toEqual([
        { tableNumber: 2, assignedSeats: 1 },
      ]);
    });

    it('keeps the updated party together rather than splitting across smaller tables', () => {
      expect(canAccommodatePartyChange(tables(2, 2, 6), 4)).toEqual([
        { tableNumber: 3, assignedSeats: 4 },
      ]);
    });
  });

  describe('party requires multiple tables', () => {
    it('splits the party across multiple tables when no single table fits', () => {
      const available = tables(3, 4);
      const result = canAccommodatePartyChange(available, 6);
      expectValidAssignment(result, available, 6);
      expect(result).toHaveLength(2);
    });

    it('fills every free seat when the updated party equals total free seats', () => {
      expect(canAccommodatePartyChange(tables(2, 3), 5)).toEqual(
        expect.arrayContaining([
          { tableNumber: 1, assignedSeats: 2 },
          { tableNumber: 2, assignedSeats: 3 },
        ]),
      );
    });
  });

  describe('party does not fit (insufficient availability)', () => {
    it('returns null when the updated party size exceeds total free seats', () => {
      expect(canAccommodatePartyChange(tables(2, 3), 6)).toBeNull();
    });

    it('returns null when there are no tables', () => {
      expect(canAccommodatePartyChange([], 2)).toBeNull();
    });

    it('returns null when every table is completely occupied (0 free seats)', () => {
      expect(canAccommodatePartyChange(tables(0, 0), 1)).toBeNull();
    });
  });

  it('does not mutate the input array of tables', () => {
    const available = tables(4, 5, 6);
    const copy = structuredClone(available);
    canAccommodatePartyChange(available, 8);
    expect(available).toEqual(copy);
  });

  // MH-06 clarification: while the party still fits at the tables it already has, it stays
  // there; when it no longer fits, it is seated again as a new booking with the MH-01 rules.
  // `tables` are the free seats of the slot without the seats of the booking itself.
  describe('with the tables the booking already has', () => {
    it('keeps a larger party at its table while it still fits there', () => {
      // Table 2 (6 free seats) is the booking's own; table 1 would be the best fit for 5.
      const result = canAccommodatePartyChange(tables(5, 6), 5, [
        { tableNumber: 2, assignedSeats: 3 },
      ]);
      expect(result).toEqual([{ tableNumber: 2, assignedSeats: 5 }]);
    });

    it('keeps a smaller party at its table instead of moving it to a better fitting one', () => {
      const result = canAccommodatePartyChange(tables(4, 6), 3, [
        { tableNumber: 2, assignedSeats: 5 },
      ]);
      expect(result).toEqual([{ tableNumber: 2, assignedSeats: 3 }]);
    });

    it('keeps a smaller party on fewer of its own tables', () => {
      const result = canAccommodatePartyChange(tables(4, 4, 8), 4, [
        { tableNumber: 1, assignedSeats: 4 },
        { tableNumber: 2, assignedSeats: 2 },
      ]);
      expect(result).toEqual([{ tableNumber: 1, assignedSeats: 4 }]);
    });

    it('spreads a larger party over its own tables while they are enough', () => {
      const result = canAccommodatePartyChange(tables(4, 4, 8), 8, [
        { tableNumber: 1, assignedSeats: 3 },
        { tableNumber: 2, assignedSeats: 3 },
      ]);
      expect(result).toEqual([
        { tableNumber: 1, assignedSeats: 4 },
        { tableNumber: 2, assignedSeats: 4 },
      ]);
    });

    it('seats the party again with the MH-01 rules when it no longer fits at its tables', () => {
      // Issue #38: table 1 is shared with another party and has only the booking's 4 seats free;
      // the party grows to 6 and table 3 has 6 free seats.
      const result = canAccommodatePartyChange(tables(4, 2, 6), 6, [
        { tableNumber: 1, assignedSeats: 4 },
      ]);
      expect(result).toEqual([{ tableNumber: 3, assignedSeats: 6 }]);
    });

    it('may reuse its old table when it is seated again', () => {
      // Table 1 alone is not enough for 7, but MH-01 fills the largest tables first.
      const result = canAccommodatePartyChange(tables(5, 2, 3), 7, [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
      expect(result).toEqual([
        { tableNumber: 1, assignedSeats: 5 },
        { tableNumber: 2, assignedSeats: 2 },
      ]);
    });

    it('refuses the change when the whole slot has not enough free seats', () => {
      expect(
        canAccommodatePartyChange(tables(3, 3), 7, [{ tableNumber: 1, assignedSeats: 3 }]),
      ).toBeNull();
    });

    it('ignores own tables that the slot no longer has', () => {
      const result = canAccommodatePartyChange(tables(4), 3, [
        { tableNumber: 9, assignedSeats: 2 },
      ]);
      expect(result).toEqual([{ tableNumber: 1, assignedSeats: 3 }]);
    });
  });
});
