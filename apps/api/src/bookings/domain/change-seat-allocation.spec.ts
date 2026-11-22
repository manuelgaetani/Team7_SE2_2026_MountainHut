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
// Course issues #38 and #48: every change is treated as a new booking and reallocated from
// scratch with MH-01 rules; `BookingsService.change` omits `current`.
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

describe('canAccommodatePartyChange (White-box heuristic branches and tie-breaker sorting)', () => {
  it('breaks smallest-fit single-table ties by lowest tableNumber on unsorted tables', () => {
    const available: TableFreeSeats[] = [
      { tableNumber: 7, freeSeats: 4 },
      { tableNumber: 2, freeSeats: 4 },
      { tableNumber: 5, freeSeats: 6 },
    ];
    expect(canAccommodatePartyChange(available, 3)).toEqual([{ tableNumber: 2, assignedSeats: 3 }]);
  });

  it('breaks largest-first multi-table ties by lowest tableNumber and seats remainder with smallestFit', () => {
    const available: TableFreeSeats[] = [
      { tableNumber: 4, freeSeats: 4 },
      { tableNumber: 1, freeSeats: 4 },
      { tableNumber: 3, freeSeats: 2 },
      { tableNumber: 2, freeSeats: 2 },
    ];
    expect(canAccommodatePartyChange(available, 5)).toEqual([
      { tableNumber: 1, assignedSeats: 4 },
      { tableNumber: 2, assignedSeats: 1 },
    ]);
  });

  it('fills multiple largest tables before picking the smallest table for the last remainder', () => {
    const available: TableFreeSeats[] = [
      { tableNumber: 1, freeSeats: 1 },
      { tableNumber: 2, freeSeats: 4 },
      { tableNumber: 3, freeSeats: 3 },
      { tableNumber: 4, freeSeats: 4 },
    ];
    expect(canAccommodatePartyChange(available, 9)).toEqual([
      { tableNumber: 2, assignedSeats: 4 },
      { tableNumber: 4, assignedSeats: 4 },
      { tableNumber: 1, assignedSeats: 1 },
    ]);
  });

  it('ignores non-positive freeSeats entries when computing capacity and allocations', () => {
    const available: TableFreeSeats[] = [
      { tableNumber: 1, freeSeats: -2 },
      { tableNumber: 2, freeSeats: 0 },
      { tableNumber: 3, freeSeats: 3 },
    ];
    expect(canAccommodatePartyChange(available, 4)).toBeNull();
    expect(canAccommodatePartyChange(available, 3)).toEqual([{ tableNumber: 3, assignedSeats: 3 }]);
  });

  it('produces identical allocations regardless of caller table array order', () => {
    const ascending: TableFreeSeats[] = [
      { tableNumber: 2, freeSeats: 3 },
      { tableNumber: 5, freeSeats: 4 },
      { tableNumber: 8, freeSeats: 2 },
    ];
    const reversed = [...ascending].reverse();
    expect(canAccommodatePartyChange(ascending, 6)).toEqual(canAccommodatePartyChange(reversed, 6));
  });

  it('treats explicit empty current allocation identically to omitted current', () => {
    const available = tables(6, 4);
    expect(canAccommodatePartyChange(available, 3, [])).toEqual(
      canAccommodatePartyChange(available, 3),
    );
  });
});

describe('canAccommodatePartyChange (Gray-box DB slot_tables consistency invariants)', () => {
  it('preserves booking_tables PK/FK and slot_tables capacity invariants on sparse partially occupied tables', () => {
    // Simulates rows returned by findFreeSeatsByTable (st.seats - booked seats excluding this booking).
    const slotTables = [
      { tableNumber: 10, seats: 6, otherBooked: 2 },
      { tableNumber: 25, seats: 8, otherBooked: 8 },
      { tableNumber: 40, seats: 4, otherBooked: 1 },
      { tableNumber: 55, seats: 5, otherBooked: 0 },
    ];
    const free: TableFreeSeats[] = slotTables.map((t) => ({
      tableNumber: t.tableNumber,
      freeSeats: t.seats - t.otherBooked,
    }));

    const allocation = canAccommodatePartyChange(free, 8);
    expectValidAssignment(allocation, free, 8);

    const byTable = new Map(slotTables.map((t) => [t.tableNumber, t]));
    for (const entry of allocation!) {
      const row = byTable.get(entry.tableNumber);
      expect(row).toBeDefined();
      expect(row!.otherBooked + entry.assignedSeats).toBeLessThanOrEqual(row!.seats);
    }
    expect(allocation).toEqual([
      { tableNumber: 55, assignedSeats: 5 },
      { tableNumber: 40, assignedSeats: 3 },
    ]);
  });

  it('never oversells total slot_tables seats across sequential re-allocations', () => {
    const slotCapacity = new Map<number, number>([
      [1, 4],
      [2, 6],
    ]);
    const available = [...slotCapacity.entries()].map(([tableNumber, freeSeats]) => ({
      tableNumber,
      freeSeats,
    }));

    const first = canAccommodatePartyChange(available, 4)!;
    const afterFirst = available.map((t) => {
      const taken = first.find((a) => a.tableNumber === t.tableNumber)?.assignedSeats ?? 0;
      return { tableNumber: t.tableNumber, freeSeats: t.freeSeats - taken };
    });

    const second = canAccommodatePartyChange(afterFirst, 6)!;
    expectValidAssignment(second, afterFirst, 6);
    expect(canAccommodatePartyChange(afterFirst, 7)).toBeNull();
  });
});
