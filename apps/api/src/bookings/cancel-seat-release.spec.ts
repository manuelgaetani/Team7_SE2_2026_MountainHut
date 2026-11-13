import { describe, expect, it } from 'vitest';
import { releaseCancelledSeats } from './cancel-seat-release.js';
import type { SeatAllocation, TableFreeSeats } from './seat-allocation.js';

// Spec MH-08: Cancel a booking.
// Hiker cancels a table booking so that the hut can make places available to other guests.
// Releasing seats restores capacity to the slot tables.
// TODO(MH-08-whitebox): add white-box unit tests for branch coverage and loop conditions in seat restoration
// TODO(MH-08-graybox): add gray-box unit tests verifying database row locking on slot tables during cancellation transaction
// TODO(MH-08-integration): add PostgreSQL integration tests for table capacity verification after booking cancellation
// TODO(MH-08-e2e): add Playwright E2E tests for table capacity updates after hiker cancels booking
describe('releaseCancelledSeats (Black-box seat release)', () => {
  const createTables = (...freeSeats: number[]): TableFreeSeats[] =>
    freeSeats.map((seats, idx) => ({ tableNumber: idx + 1, freeSeats: seats }));

  describe('Equivalence Partitioning: Single Table Booking Cancellation', () => {
    it('restores seats to a single table that was partially filled', () => {
      // Table 1 had 2 free seats remaining; booking had 4 seats assigned to Table 1
      const initialTables = createTables(2, 6);
      const assigned: SeatAllocation[] = [{ tableNumber: 1, assignedSeats: 4 }];

      const result = releaseCancelledSeats(initialTables, assigned);

      expect(result).toEqual([
        { tableNumber: 1, freeSeats: 6 },
        { tableNumber: 2, freeSeats: 6 },
      ]);
    });

    it('restores seats to a single table that was completely full (0 free seats)', () => {
      // Table 1 was completely full (0 free seats) with a 6-person booking
      const initialTables = createTables(0, 4);
      const assigned: SeatAllocation[] = [{ tableNumber: 1, assignedSeats: 6 }];

      const result = releaseCancelledSeats(initialTables, assigned);

      expect(result).toEqual([
        { tableNumber: 1, freeSeats: 6 },
        { tableNumber: 2, freeSeats: 4 },
      ]);
    });
  });

  describe('Equivalence Partitioning: Multi-Table Booking Cancellation', () => {
    it('restores seats across all assigned tables when a split party is cancelled', () => {
      // Party of 6 was split: 4 at Table 1 and 2 at Table 2
      const initialTables = createTables(0, 1, 8);
      const assigned: SeatAllocation[] = [
        { tableNumber: 1, assignedSeats: 4 },
        { tableNumber: 2, assignedSeats: 2 },
      ];

      const result = releaseCancelledSeats(initialTables, assigned);

      expect(result).toEqual([
        { tableNumber: 1, freeSeats: 4 },
        { tableNumber: 2, freeSeats: 3 },
        { tableNumber: 3, freeSeats: 8 },
      ]);
    });

    it('restores seats across 3 tables for large party cancellations', () => {
      const initialTables = createTables(0, 0, 0, 4);
      const assigned: SeatAllocation[] = [
        { tableNumber: 1, assignedSeats: 4 },
        { tableNumber: 2, assignedSeats: 4 },
        { tableNumber: 3, assignedSeats: 2 },
      ];

      const result = releaseCancelledSeats(initialTables, assigned);

      expect(result).toEqual([
        { tableNumber: 1, freeSeats: 4 },
        { tableNumber: 2, freeSeats: 4 },
        { tableNumber: 3, freeSeats: 2 },
        { tableNumber: 4, freeSeats: 4 },
      ]);
    });
  });

  describe('Equivalence Partitioning: Unaffected Tables', () => {
    it('leaves tables that were not part of the booking completely untouched', () => {
      const initialTables = [
        { tableNumber: 1, freeSeats: 2 },
        { tableNumber: 2, freeSeats: 5 },
        { tableNumber: 3, freeSeats: 8 },
      ];
      // Only Table 2 is cancelled
      const assigned: SeatAllocation[] = [{ tableNumber: 2, assignedSeats: 3 }];

      const result = releaseCancelledSeats(initialTables, assigned);

      expect(result[0]).toEqual({ tableNumber: 1, freeSeats: 2 });
      expect(result[1]).toEqual({ tableNumber: 2, freeSeats: 8 });
      expect(result[2]).toEqual({ tableNumber: 3, freeSeats: 8 });
    });
  });

  describe('Boundary Value Analysis (BVA)', () => {
    it('handles minimum party size of 1 seat released', () => {
      const initialTables = createTables(3);
      const assigned: SeatAllocation[] = [{ tableNumber: 1, assignedSeats: 1 }];

      const result = releaseCancelledSeats(initialTables, assigned);

      expect(result).toEqual([{ tableNumber: 1, freeSeats: 4 }]);
    });

    it('preserves table order when releasing seats on non-sequential tables', () => {
      const initialTables = [
        { tableNumber: 5, freeSeats: 1 },
        { tableNumber: 12, freeSeats: 0 },
        { tableNumber: 20, freeSeats: 3 },
      ];
      const assigned: SeatAllocation[] = [{ tableNumber: 12, assignedSeats: 4 }];

      const result = releaseCancelledSeats(initialTables, assigned);

      expect(result.map((t) => t.tableNumber)).toEqual([5, 12, 20]);
      expect(result[1].freeSeats).toBe(4);
    });

    it('returns an identical free seats configuration if the assigned list is empty', () => {
      const initialTables = createTables(2, 4, 6);
      const result = releaseCancelledSeats(initialTables, []);

      expect(result).toEqual(initialTables);
    });
  });

  describe('Immutability and Purity', () => {
    it('does not mutate the input tables array', () => {
      const initialTables = createTables(2, 4);
      const originalCopy = JSON.parse(JSON.stringify(initialTables));
      const assigned: SeatAllocation[] = [{ tableNumber: 1, assignedSeats: 2 }];

      releaseCancelledSeats(initialTables, assigned);

      expect(initialTables).toEqual(originalCopy);
    });

    it('returns a new array with newly created table objects', () => {
      const initialTables = createTables(2, 4);
      const assigned: SeatAllocation[] = [{ tableNumber: 1, assignedSeats: 2 }];

      const result = releaseCancelledSeats(initialTables, assigned);

      expect(result).not.toBe(initialTables);
      expect(result[0]).not.toBe(initialTables[0]);
    });
  });

  describe('Error Guessing & Defensive Checks', () => {
    it('throws or handles assigned table not found in slot table list', () => {
      const initialTables = createTables(2, 4);
      const assigned: SeatAllocation[] = [{ tableNumber: 99, assignedSeats: 2 }];

      expect(() => releaseCancelledSeats(initialTables, assigned)).toThrow();
    });

    it('throws when assignedSeats is negative', () => {
      const initialTables = createTables(2, 4);
      const assigned: SeatAllocation[] = [{ tableNumber: 1, assignedSeats: -2 }];

      expect(() => releaseCancelledSeats(initialTables, assigned)).toThrow();
    });
  });
});
