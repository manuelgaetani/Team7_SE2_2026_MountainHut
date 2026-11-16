import { describe, expect, it } from 'vitest';
import type { SlotDetails } from '@mountain-hut/shared';
import { buildFloorPlan, groupLabel } from './floor-plan.js';
import type { FloorAllocation } from './floor-plan.js';

const slot: SlotDetails = {
  id: 5,
  date: '2026-11-14',
  startTime: '12:30',
  endTime: '13:30',
  tables: [
    { tableNumber: 1, seats: 4 },
    { tableNumber: 2, seats: 4 },
    { tableNumber: 4, seats: 6 },
    { tableNumber: 5, seats: 6 },
  ],
  totalSeats: 20,
};

const allocation = (
  bookingId: number,
  tableNumber: number,
  assignedSeats: number,
  overrides: Partial<FloorAllocation> = {},
): FloorAllocation => ({
  bookingId,
  fullName: `Guest ${bookingId}`,
  partySize: assignedSeats,
  status: 'CONFIRMED',
  startTime: '12:30',
  endTime: '13:30',
  tableNumber,
  assignedSeats,
  ...overrides,
});

describe('groupLabel', () => {
  it.each([
    [0, 'A'],
    [1, 'B'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
    [51, 'AZ'],
    [52, 'BA'],
  ])('labels the group %d as %s', (index, label) => {
    expect(groupLabel(index)).toBe(label);
  });
});

describe('buildFloorPlan', () => {
  describe('without bookings', () => {
    it('shows every seat free and no group', () => {
      const plan = buildFloorPlan(slot, []);
      expect(plan.groups).toEqual([]);
      expect(
        plan.tables.map((t) => [t.tableNumber, t.capacity, t.occupiedSeats, t.freeSeats]),
      ).toEqual([
        [1, 4, 0, 4],
        [2, 4, 0, 4],
        [4, 6, 0, 6],
        [5, 6, 0, 6],
      ]);
      expect(plan.totals).toEqual({
        capacity: 20,
        occupiedSeats: 0,
        freeSeats: 20,
        confirmedGroups: 0,
        splitGroups: 0,
      });
    });

    it('describes the slot', () => {
      expect(buildFloorPlan(slot, []).slot).toEqual({
        id: 5,
        date: '2026-11-14',
        startTime: '12:30',
        endTime: '13:30',
      });
    });
  });

  describe('with bookings', () => {
    const allocations = [
      allocation(1, 1, 4),
      allocation(2, 4, 6, { partySize: 8 }),
      allocation(2, 5, 2, { partySize: 8 }),
    ];

    it('counts occupied and free seats at each table', () => {
      const plan = buildFloorPlan(slot, allocations);
      expect(plan.tables.map((t) => [t.tableNumber, t.occupiedSeats, t.freeSeats])).toEqual([
        [1, 4, 0],
        [2, 0, 4],
        [4, 6, 0],
        [5, 2, 4],
      ]);
    });

    it('sums the totals of the slot', () => {
      expect(buildFloorPlan(slot, allocations).totals).toEqual({
        capacity: 20,
        occupiedSeats: 12,
        freeSeats: 8,
        confirmedGroups: 2,
        splitGroups: 1,
      });
    });

    it('lists the tables of a group split over more tables', () => {
      const ferrari = buildFloorPlan(slot, allocations).groups[1];
      expect(ferrari).toMatchObject({
        label: 'B',
        bookingId: 2,
        fullName: 'Guest 2',
        partySize: 8,
        tables: [
          { tableNumber: 4, seats: 6 },
          { tableNumber: 5, seats: 2 },
        ],
      });
    });

    it('lists the groups seated at each table', () => {
      const plan = buildFloorPlan(slot, [...allocations, allocation(3, 5, 2)]);
      expect(plan.tables[3]!.groups).toEqual([
        { label: 'B', seats: 2 },
        { label: 'C', seats: 2 },
      ]);
    });

    it('labels the groups by booking id, whatever the order of the rows', () => {
      const plan = buildFloorPlan(slot, [allocation(7, 1, 2), allocation(3, 2, 2)]);
      expect(plan.groups.map((g) => [g.label, g.bookingId])).toEqual([
        ['A', 3],
        ['B', 7],
      ]);
    });

    it('keeps going after Z', () => {
      const many = Array.from({ length: 27 }, (_, i) => allocation(i + 1, 1, 1));
      expect(buildFloorPlan(slot, many).groups.at(-1)!.label).toBe('AA');
    });

    it('does not change the rows it receives', () => {
      const rows = [allocation(7, 1, 2), allocation(3, 2, 2)];
      buildFloorPlan(slot, rows);
      expect(rows.map((r) => r.bookingId)).toEqual([7, 3]);
    });
  });

  describe('pending bookings', () => {
    it('hold their seats but are not confirmed groups', () => {
      const plan = buildFloorPlan(slot, [allocation(1, 1, 2, { status: 'PENDING' })]);
      expect(plan.groups[0]!.status).toBe('PENDING');
      expect(plan.totals.occupiedSeats).toBe(2);
      expect(plan.totals.freeSeats).toBe(18);
      expect(plan.totals.confirmedGroups).toBe(0);
    });
  });

  describe('bookings of an overlapping slot', () => {
    it('keep the time of the slot they booked', () => {
      const plan = buildFloorPlan(slot, [
        allocation(1, 1, 3, { startTime: '12:00', endTime: '13:00' }),
      ]);
      expect(plan.groups[0]).toMatchObject({ startTime: '12:00', endTime: '13:00' });
      expect(plan.tables[0]).toMatchObject({ occupiedSeats: 3, freeSeats: 1 });
    });
  });

  it('never shows a negative number of free seats', () => {
    const plan = buildFloorPlan(slot, [allocation(1, 1, 3), allocation(2, 1, 3)]);
    expect(plan.tables[0]).toMatchObject({ occupiedSeats: 6, freeSeats: 0 });
  });
});
