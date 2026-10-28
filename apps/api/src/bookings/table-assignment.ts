export interface FreeTable {
  tableNumber: number;
  freeSeats: number;
}

export interface TableAssignment {
  tableNumber: number;
  seats: number;
}

// TODO(MH-01): stub. Implement the table assignment tested in table-assignment.spec.ts,
// then remove describe.skip there.
export const assignTables: (
  tables: FreeTable[],
  partySize: number,
) => TableAssignment[] | null = () => {
  throw new Error('Not implemented');
};
