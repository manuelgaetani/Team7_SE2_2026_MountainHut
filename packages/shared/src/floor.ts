// Only these bookings hold seats; a REJECTED booking holds none.
export type FloorBookingStatus = 'CONFIRMED' | 'PENDING';

// A group sitting at one table, with the seats it takes there.
export interface FloorTableGroup {
  label: string;
  seats: number;
}

export interface FloorTable {
  tableNumber: number;
  capacity: number;
  occupiedSeats: number;
  freeSeats: number;
  groups: FloorTableGroup[];
}

// A booking seen as a group. The label (A, B, ...) tells the groups apart in the plan.
// startTime and endTime are those of the slot the group booked: tables are shared by
// overlapping slots, so a group can come from another slot than the one shown.
export interface FloorGroup {
  label: string;
  bookingId: number;
  fullName: string;
  partySize: number;
  status: FloorBookingStatus;
  startTime: string;
  endTime: string;
  tables: { tableNumber: number; seats: number }[];
}

export interface FloorTotals {
  capacity: number;
  occupiedSeats: number;
  freeSeats: number;
  confirmedGroups: number;
  splitGroups: number;
}

export interface FloorPlan {
  slot: { id: number; date: string; startTime: string; endTime: string };
  tables: FloorTable[];
  groups: FloorGroup[];
  totals: FloorTotals;
}
