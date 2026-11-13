import type { SeatAllocation, TableFreeSeats } from './seat-allocation.js';

// Gives the seats of a cancelled booking back to its tables. Pure: the input is not modified.
export function releaseCancelledSeats(
  tables: TableFreeSeats[],
  assigned: SeatAllocation[],
): TableFreeSeats[] {
  const released = tables.map((table) => ({ ...table }));
  for (const { tableNumber, assignedSeats } of assigned) {
    if (assignedSeats < 0) throw new Error('The assigned seats cannot be negative');
    const table = released.find((t) => t.tableNumber === tableNumber);
    if (!table) throw new Error(`Table ${tableNumber} is not in the slot`);
    table.freeSeats += assignedSeats;
  }
  return released;
}