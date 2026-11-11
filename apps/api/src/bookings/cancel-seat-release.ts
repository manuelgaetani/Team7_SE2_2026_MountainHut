import type { SeatAllocation, TableFreeSeats } from './seat-allocation.js';

// TODO(MH-08): stub. Implement the logic tested in cancel-seat-release.spec.ts, then remove describe.skip there.
export const releaseCancelledSeats: (
  tables: TableFreeSeats[],
  assigned: SeatAllocation[],
) => TableFreeSeats[] = () => {
  throw new Error('Not implemented');
};

