import { describe, expect, it } from 'vitest';
import type { FloorGroup, FloorPlan } from '@mountain-hut/shared';
import { floorMoments, isSlotGroup } from './floorMoments.ts';

const slot = { id: 5, date: '2026-11-15', startTime: '12:30', endTime: '13:30' };

const group = (
  label: string,
  startTime: string,
  endTime: string,
  tables: { tableNumber: number; seats: number }[],
): FloorGroup => ({
  label,
  bookingId: label.charCodeAt(0),
  fullName: `Group ${label}`,
  partySize: tables.reduce((sum, t) => sum + t.seats, 0),
  status: 'CONFIRMED',
  startTime,
  endTime,
  tables,
});

// Only tables and groups matter here: the other fields come from the API and are not read.
const plan = (groups: FloorGroup[], capacities = [2, 2, 4, 4, 6, 6]): FloorPlan => ({
  slot,
  tables: capacities.map((capacity, i) => ({
    tableNumber: i + 1,
    capacity,
    occupiedSeats: 0,
    freeSeats: capacity,
    groups: [],
  })),
  groups,
  totals: { capacity: 0, occupiedSeats: 0, freeSeats: 0, confirmedGroups: 0, splitGroups: 0 },
});

// The case that showed 30 / 24 seats taken: two groups of 12:00–13:00 and one of
// 13:00–14:00, seen from the slot 12:30–13:30 in between.
const ale = group('A', '12:00', '13:00', [
  { tableNumber: 3, seats: 4 },
  { tableNumber: 5, seats: 6 },
]);
const bea = group('B', '12:00', '13:00', [
  { tableNumber: 1, seats: 2 },
  { tableNumber: 4, seats: 4 },
  { tableNumber: 6, seats: 6 },
]);
const fab = group('C', '13:00', '14:00', [
  { tableNumber: 1, seats: 1 },
  { tableNumber: 2, seats: 1 },
  { tableNumber: 3, seats: 1 },
  { tableNumber: 4, seats: 4 },
]);
const rossi = group('D', '12:30', '13:30', [{ tableNumber: 2, seats: 1 }]);

const at = (moment: ReturnType<typeof floorMoments>[number], n: number) =>
  moment.tables.find((t) => t.tableNumber === n)!;

describe('isSlotGroup', () => {
  it('tells the groups of the slot from those of an overlapping slot', () => {
    expect(isSlotGroup(rossi, slot)).toBe(true);
    expect(isSlotGroup(ale, slot)).toBe(false);
    expect(isSlotGroup(group('E', '12:30', '14:00', []), slot)).toBe(false);
  });
});

describe('floorMoments', () => {
  it('keeps the whole slot as one moment when no other slot overlaps it', () => {
    const moments = floorMoments(plan([rossi]));
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({
      startTime: '12:30',
      endTime: '13:30',
      otherSlots: [],
      occupiedSeats: 1,
      capacity: 24,
    });
    expect(at(moments[0]!, 2)).toEqual({
      tableNumber: 2,
      capacity: 2,
      groups: [{ label: 'D', seats: 1 }],
      otherSeats: 0,
      freeSeats: 1,
    });
  });

  it('splits the slot where an overlapping slot ends and the next one starts', () => {
    const moments = floorMoments(plan([ale, bea, fab, rossi]));
    expect(moments.map((m) => [m.startTime, m.endTime, m.otherSlots])).toEqual([
      ['12:30', '13:00', ['12:00–13:00']],
      ['13:00', '13:30', ['13:00–14:00']],
    ]);
  });

  it('never takes more seats than there are, in any moment', () => {
    const [first, second] = floorMoments(plan([ale, bea, fab]));
    expect(first!.occupiedSeats).toBe(22);
    expect(second!.occupiedSeats).toBe(7);
    for (const moment of [first!, second!]) {
      for (const table of moment.tables) {
        expect(table.otherSeats + table.freeSeats).toBeLessThanOrEqual(table.capacity);
      }
    }
  });

  it('counts the seats of an overlapping slot apart from the groups of the slot', () => {
    const [first, second] = floorMoments(plan([ale, bea, fab, rossi]));
    expect(at(first!, 2)).toMatchObject({
      groups: [{ label: 'D', seats: 1 }],
      otherSeats: 0,
      freeSeats: 1,
    });
    expect(at(second!, 2)).toMatchObject({
      groups: [{ label: 'D', seats: 1 }],
      otherSeats: 1,
      freeSeats: 0,
    });
    expect(at(first!, 6)).toMatchObject({ groups: [], otherSeats: 6, freeSeats: 0 });
    expect(at(second!, 6)).toMatchObject({ groups: [], otherSeats: 0, freeSeats: 6 });
  });

  it('names every overlapping slot of a moment once, in order', () => {
    const late = group('E', '12:00', '13:00', [{ tableNumber: 3, seats: 1 }]);
    const long = group('F', '11:30', '14:00', [{ tableNumber: 6, seats: 2 }]);
    const moments = floorMoments(plan([late, ale, long]));
    expect(moments.map((m) => m.otherSlots)).toEqual([
      ['11:30–14:00', '12:00–13:00'],
      ['11:30–14:00'],
    ]);
  });

  it('ignores times of overlapping slots that fall outside the slot', () => {
    const wide = group('E', '11:00', '14:00', [{ tableNumber: 3, seats: 2 }]);
    const moments = floorMoments(plan([wide]));
    expect(moments).toHaveLength(1);
    expect(moments[0]!.otherSlots).toEqual(['11:00–14:00']);
    expect(at(moments[0]!, 3).otherSeats).toBe(2);
  });

  it('never shows a negative number of free seats', () => {
    const [moment] = floorMoments(
      plan([group('E', '12:30', '13:30', [{ tableNumber: 1, seats: 3 }])]),
    );
    expect(at(moment!, 1).freeSeats).toBe(0);
    expect(moment!.occupiedSeats).toBe(2);
  });
});
