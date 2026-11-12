import type { SeatAllocation, TableFreeSeats } from './seat-allocation.js';

// TODO(MH-06): stub. Implement the logic tested in change-seat-allocation.spec.ts, then remove describe.skip there.
export function canAccommodatePartyChange(
  _availableTables: TableFreeSeats[],
  _partySize: number,
): SeatAllocation[] | null {
  throw new Error('Not implemented');
}
