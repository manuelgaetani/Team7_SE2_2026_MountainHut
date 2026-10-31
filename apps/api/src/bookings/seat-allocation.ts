export interface TableFreeSeats {
  tableNumber: number;
  freeSeats: number;
}

export interface SeatAllocation {
  tableNumber: number;
  assignedSeats: number;
}

// The table with the fewest free seats that can hold the given number of people.
function smallestFit(tables: TableFreeSeats[], seats: number): TableFreeSeats | undefined {
  return tables
    .filter((t) => t.freeSeats >= seats)
    .sort((a, b) => a.freeSeats - b.freeSeats || a.tableNumber - b.tableNumber)[0];
}

// One table if a single one is enough: the smallest that fits.
// Otherwise fills the tables with the most free seats, which uses as few tables as
// possible, and seats the last people at the smallest table that fits them.
// Returns null if the total seats are not enough.
export function allocateSeats(
  tables: TableFreeSeats[],
  partySize: number,
): SeatAllocation[] | null {
  const open = tables.filter((t) => t.freeSeats > 0);
  const total = open.reduce((sum, t) => sum + t.freeSeats, 0);
  if (total < partySize) return null;

  const left = [...open].sort((a, b) => b.freeSeats - a.freeSeats || a.tableNumber - b.tableNumber);
  const result: SeatAllocation[] = [];
  let remaining = partySize;
  while (remaining > 0) {
    const last = smallestFit(left, remaining);
    if (last) {
      result.push({ tableNumber: last.tableNumber, assignedSeats: remaining });
      break;
    }
    const largest = left.shift()!;
    result.push({ tableNumber: largest.tableNumber, assignedSeats: largest.freeSeats });
    remaining -= largest.freeSeats;
  }
  return result;
}
