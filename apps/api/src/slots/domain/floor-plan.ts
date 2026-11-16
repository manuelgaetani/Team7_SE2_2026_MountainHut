import type {
  FloorBookingStatus,
  FloorGroup,
  FloorPlan,
  FloorTable,
  SlotDetails,
} from '@mountain-hut/shared';

// One row of a booking at one table: the seats a group takes there.
// Bookings can come from any slot that overlaps the one shown, because tables are shared.
export interface FloorAllocation {
  bookingId: number;
  fullName: string;
  partySize: number;
  status: FloorBookingStatus;
  startTime: string;
  endTime: string;
  tableNumber: number;
  assignedSeats: number;
}

// A, B, ... Z, AA, AB, ...: the label that tells a group apart in the plan.
export function groupLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

// Builds the plan of a slot from its tables and the seats already assigned on them.
// Groups are labelled by booking id, so a label does not change while the bookings do not.
export function buildFloorPlan(slot: SlotDetails, allocations: FloorAllocation[]): FloorPlan {
  const ordered = [...allocations].sort(
    (a, b) => a.bookingId - b.bookingId || a.tableNumber - b.tableNumber,
  );

  const groups = new Map<number, FloorGroup>();
  for (const a of ordered) {
    let group = groups.get(a.bookingId);
    if (!group) {
      group = {
        label: groupLabel(groups.size),
        bookingId: a.bookingId,
        fullName: a.fullName,
        partySize: a.partySize,
        status: a.status,
        startTime: a.startTime,
        endTime: a.endTime,
        tables: [],
      };
      groups.set(a.bookingId, group);
    }
    group.tables.push({ tableNumber: a.tableNumber, seats: a.assignedSeats });
  }
  const groupList = [...groups.values()];

  const tables: FloorTable[] = slot.tables.map((table) => {
    const here = ordered.filter((a) => a.tableNumber === table.tableNumber);
    const occupiedSeats = here.reduce((sum, a) => sum + a.assignedSeats, 0);
    return {
      tableNumber: table.tableNumber,
      capacity: table.seats,
      occupiedSeats,
      freeSeats: Math.max(table.seats - occupiedSeats, 0),
      groups: here.map((a) => ({
        label: groups.get(a.bookingId)!.label,
        seats: a.assignedSeats,
      })),
    };
  });

  return {
    slot: { id: slot.id, date: slot.date, startTime: slot.startTime, endTime: slot.endTime },
    tables,
    groups: groupList,
    totals: {
      capacity: tables.reduce((sum, t) => sum + t.capacity, 0),
      occupiedSeats: tables.reduce((sum, t) => sum + t.occupiedSeats, 0),
      freeSeats: tables.reduce((sum, t) => sum + t.freeSeats, 0),
      confirmedGroups: groupList.filter((g) => g.status === 'CONFIRMED').length,
      splitGroups: groupList.filter((g) => g.tables.length > 1).length,
    },
  };
}
