import type { FloorGroup, FloorPlan, FloorTableGroup } from '@mountain-hut/shared';

// A table at one moment of the slot.
export interface MomentTable {
  tableNumber: number;
  capacity: number;
  // The groups that booked the slot shown, with their seats at this table.
  groups: FloorTableGroup[];
  // Seats held at this table by groups of an overlapping slot.
  otherSeats: number;
  freeSeats: number;
}

// A part of the slot in which the same groups sit at the tables. Slots that overlap share
// the tables, so at a given moment a table is used by the slot shown and by the slots
// around it. Within one moment the seats always add up: the plan never mixes groups that
// are not seated at the same time.
export interface FloorMoment {
  startTime: string;
  endTime: string;
  // "12:00–13:00" for every overlapping slot that holds seats in this moment.
  otherSlots: string[];
  tables: MomentTable[];
  occupiedSeats: number;
  capacity: number;
}

const slotTime = (g: { startTime: string; endTime: string }): string =>
  `${g.startTime}–${g.endTime}`;

// True when the group booked the slot shown, false when it booked an overlapping one.
export const isSlotGroup = (group: FloorGroup, slot: FloorPlan['slot']): boolean =>
  group.startTime === slot.startTime && group.endTime === slot.endTime;

const seatsAt = (group: FloorGroup, tableNumber: number): number =>
  group.tables.find((t) => t.tableNumber === tableNumber)?.seats ?? 0;

// Splits the slot where an overlapping slot starts or ends. Times are "HH:MM", so they
// compare as strings.
export function floorMoments(plan: FloorPlan): FloorMoment[] {
  const { slot } = plan;
  const own = plan.groups.filter((g) => isSlotGroup(g, slot));
  const others = plan.groups.filter((g) => !isSlotGroup(g, slot));

  const inside = others
    .flatMap((g) => [g.startTime, g.endTime])
    .filter((t) => t > slot.startTime && t < slot.endTime);
  const bounds = [...new Set([slot.startTime, ...inside, slot.endTime])].sort();

  return bounds.slice(0, -1).map((startTime, i) => {
    const endTime = bounds[i + 1]!;
    const here = others.filter((g) => g.startTime < endTime && g.endTime > startTime);

    const tables = plan.tables.map((table): MomentTable => {
      const groups = own
        .map((g) => ({ label: g.label, seats: seatsAt(g, table.tableNumber) }))
        .filter((g) => g.seats > 0);
      const ownSeats = groups.reduce((sum, g) => sum + g.seats, 0);
      const otherSeats = here.reduce((sum, g) => sum + seatsAt(g, table.tableNumber), 0);
      return {
        tableNumber: table.tableNumber,
        capacity: table.capacity,
        groups,
        otherSeats,
        freeSeats: Math.max(table.capacity - ownSeats - otherSeats, 0),
      };
    });

    return {
      startTime,
      endTime,
      otherSlots: [...new Set(here.map(slotTime))].sort(),
      tables,
      occupiedSeats: tables.reduce((sum, t) => sum + t.capacity - t.freeSeats, 0),
      capacity: tables.reduce((sum, t) => sum + t.capacity, 0),
    };
  });
}
