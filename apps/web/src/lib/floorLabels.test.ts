import { describe, expect, it } from 'vitest';
import type { FloorGroup } from '@mountain-hut/shared';
import { ApiError } from '../api/client.ts';
import type { MomentTable } from './floorMoments.ts';
import {
  floorErrorMessage,
  groupTablesLabel,
  onTablesLabel,
  otherSlotsLabel,
  peopleLabel,
  seatAriaLabel,
  seatsTakenLabel,
  tableTakenLabel,
} from './floorLabels.ts';

const table = (taken: number, capacity = 4): MomentTable => ({
  tableNumber: 1,
  capacity,
  groups: [],
  otherSeats: 0,
  freeSeats: capacity - taken,
});

const group: FloorGroup = {
  label: 'C',
  bookingId: 3,
  fullName: 'Ferrari',
  partySize: 8,
  status: 'CONFIRMED',
  startTime: '12:30',
  endTime: '13:30',
  tables: [
    { tableNumber: 4, seats: 6 },
    { tableNumber: 5, seats: 2 },
  ],
};

describe('floor labels', () => {
  it('uses the singular only for one person', () => {
    expect(peopleLabel(1)).toBe('1 person');
    expect(peopleLabel(8)).toBe('8 people');
  });

  it('says how full a table is', () => {
    expect(tableTakenLabel(table(2))).toBe('2 / 4 taken');
    expect(tableTakenLabel(table(0))).toBe('0 / 4 taken');
    expect(tableTakenLabel(table(4))).toBe('full');
  });

  it('says how many seats are taken in total', () => {
    expect(seatsTakenLabel(5, 8)).toBe('5 / 8 seats taken');
  });

  it('lists the tables of a group', () => {
    expect(groupTablesLabel(group)).toBe('T4 · 6 + T5 · 2');
    expect(onTablesLabel(1)).toBe('on 1 table');
    expect(onTablesLabel(2)).toBe('on 2 tables');
  });

  it('names the overlapping slots', () => {
    expect(otherSlotsLabel(['12:00–13:00'])).toBe('the slot 12:00–13:00');
    expect(otherSlotsLabel(['11:30–12:30', '13:00–14:00'])).toBe(
      'the slots 11:30–12:30 and 13:00–14:00',
    );
    expect(otherSlotsLabel(['11:00–12:30', '11:30–12:30', '12:00–13:00'])).toBe(
      'the slots 11:00–12:30, 11:30–12:30 and 12:00–13:00',
    );
  });

  it('describes a seat for screen readers', () => {
    expect(seatAriaLabel('A', 4, 6)).toBe('Group A, table 4, 6 seats');
    expect(seatAriaLabel('B', 1, 1)).toBe('Group B, table 1, 1 seat');
  });
});

describe('floorErrorMessage', () => {
  it('asks to log in again when the session has expired', () => {
    expect(floorErrorMessage(new ApiError(401, 'Unauthorized'))).toBe(
      'The session has expired. Please log in again.',
    );
  });

  it('says the slot is not found', () => {
    expect(floorErrorMessage(new ApiError(404, 'whatever'))).toBe('Slot not found');
  });

  it('shows the message of the API for a 403', () => {
    expect(floorErrorMessage(new ApiError(403, 'Forbidden resource'))).toBe('Forbidden resource');
  });

  it('shows a generic message for any other failure', () => {
    expect(floorErrorMessage(new ApiError(500, 'boom'))).toBe(
      'The floor plan could not be loaded. Please try again.',
    );
    expect(floorErrorMessage(new Error('network'))).toBe(
      'The floor plan could not be loaded. Please try again.',
    );
  });
});
