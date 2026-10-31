export interface TableFreeSeats {
  tableNumber: number;
  freeSeats: number;
}

export interface SeatAllocation {
  tableNumber: number;
  assignedSeats: number;
}

// Un solo tavolo se ce n'è uno che basta (il più piccolo possibile).
// Altrimenti riempie i tavoli con più posti liberi finché copre il gruppo.
// Restituisce null se i posti totali non bastano.
export function allocateSeats(
  tables: TableFreeSeats[],
  partySize: number,
): SeatAllocation[] | null {
  const open = tables.filter((t) => t.freeSeats > 0);
  const total = open.reduce((sum, t) => sum + t.freeSeats, 0);
  if (total < partySize) return null;

  const single = open
    .filter((t) => t.freeSeats >= partySize)
    .sort((a, b) => a.freeSeats - b.freeSeats || a.tableNumber - b.tableNumber)[0];
  if (single) return [{ tableNumber: single.tableNumber, assignedSeats: partySize }];

  const sorted = [...open].sort(
    (a, b) => b.freeSeats - a.freeSeats || a.tableNumber - b.tableNumber,
  );
  const result: SeatAllocation[] = [];
  let remaining = partySize;
  for (const table of sorted) {
    if (remaining === 0) break;
    const take = Math.min(table.freeSeats, remaining);
    result.push({ tableNumber: table.tableNumber, assignedSeats: take });
    remaining -= take;
  }
  return result;
}
