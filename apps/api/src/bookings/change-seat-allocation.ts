import { allocateSeats } from './seat-allocation.js';
import type { SeatAllocation, TableFreeSeats } from './seat-allocation.js';

// Tables for a booking whose party size or slot changes. `tables` are the free seats of the
// target slot without the seats of the booking itself.
// While the party still fits at the tables it already has (`current`), it stays there; otherwise
// it is treated as a new booking and seated with the MH-01 rules. Null if the seats are not enough.
export function canAccommodatePartyChange(
  tables: TableFreeSeats[],
  partySize: number,
  current: SeatAllocation[] = [],
): SeatAllocation[] | null {
  const own = new Set(current.map((a) => a.tableNumber));
  const kept = tables.filter((t) => own.has(t.tableNumber));
  return allocateSeats(kept, partySize) ?? allocateSeats(tables, partySize);
}
