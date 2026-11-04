import { describe, expect, it } from 'vitest';
import {
  createSlotSchema,
  defineSlotTablesSchema,
  listSlotsQuerySchema,
  slotTableSchema,
} from './slots.js';

const MAX_DB_INT = 2_147_483_647;
const validSlot = { date: '2026-11-02', startTime: '12:00', endTime: '13:00' };
const tables = [
  { tableNumber: 1, seats: 4 },
  { tableNumber: 2, seats: 6 },
];

describe('createSlotSchema', () => {
  it('accepts a slot without tables', () => {
    expect(createSlotSchema.safeParse(validSlot).success).toBe(true);
  });

  it('accepts a slot with a list of tables', () => {
    expect(createSlotSchema.safeParse({ ...validSlot, tables }).success).toBe(true);
  });

  it('accepts a slot that copies the tables of another slot', () => {
    expect(createSlotSchema.safeParse({ ...validSlot, copyTablesFromSlotId: 3 }).success).toBe(
      true,
    );
  });

  it.each(['date', 'startTime', 'endTime'])('rejects a slot without %s', (field) => {
    const input: Record<string, unknown> = { ...validSlot };
    delete input[field];
    expect(createSlotSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ['12:00', '12:00'],
    ['13:00', '12:00'],
  ])('rejects a slot from %s to %s', (startTime, endTime) => {
    expect(createSlotSchema.safeParse({ ...validSlot, startTime, endTime }).success).toBe(false);
  });

  it('accepts slots of any length, as long as they end after they start', () => {
    expect(
      createSlotSchema.safeParse({ ...validSlot, startTime: '12:00', endTime: '12:45' }).success,
    ).toBe(true);
    expect(
      createSlotSchema.safeParse({ ...validSlot, startTime: '11:30', endTime: '14:15' }).success,
    ).toBe(true);
  });

  it.each(['', '2026-13-01', '2026-02-30', '02/11/2026', '2026-1-5'])(
    'rejects the date "%s"',
    (date) => {
      expect(createSlotSchema.safeParse({ ...validSlot, date }).success).toBe(false);
    },
  );

  it.each(['', '24:00', '12:60', '9:00', '12', '12:00:00'])(
    'rejects the start time "%s"',
    (startTime) => {
      expect(createSlotSchema.safeParse({ ...validSlot, startTime }).success).toBe(false);
    },
  );

  it('rejects an empty list of tables', () => {
    expect(createSlotSchema.safeParse({ ...validSlot, tables: [] }).success).toBe(false);
  });

  it('rejects two tables with the same number in one slot', () => {
    const duplicated = [
      { tableNumber: 1, seats: 4 },
      { tableNumber: 1, seats: 6 },
    ];
    expect(createSlotSchema.safeParse({ ...validSlot, tables: duplicated }).success).toBe(false);
  });

  it('rejects a slot that gives both tables and a slot to copy from', () => {
    expect(
      createSlotSchema.safeParse({ ...validSlot, tables, copyTablesFromSlotId: 3 }).success,
    ).toBe(false);
  });

  it.each([0, -1, 1.5, MAX_DB_INT + 1])('rejects the slot to copy from %s', (id) => {
    expect(createSlotSchema.safeParse({ ...validSlot, copyTablesFromSlotId: id }).success).toBe(
      false,
    );
  });
});

describe('slotTableSchema', () => {
  it('accepts a table with a number and its seats', () => {
    expect(slotTableSchema.safeParse({ tableNumber: 1, seats: 4 }).success).toBe(true);
  });

  it.each([0, -1, 2.5, MAX_DB_INT + 1])('rejects %s seats', (seats) => {
    expect(slotTableSchema.safeParse({ tableNumber: 1, seats }).success).toBe(false);
  });

  it.each([0, -1, 2.5, MAX_DB_INT + 1])('rejects the table number %s', (tableNumber) => {
    expect(slotTableSchema.safeParse({ tableNumber, seats: 4 }).success).toBe(false);
  });

  it('accepts the largest value a database integer can hold', () => {
    expect(slotTableSchema.safeParse({ tableNumber: MAX_DB_INT, seats: MAX_DB_INT }).success).toBe(
      true,
    );
  });

  it('rejects numbers sent as strings', () => {
    expect(slotTableSchema.safeParse({ tableNumber: '1', seats: 4 }).success).toBe(false);
    expect(slotTableSchema.safeParse({ tableNumber: 1, seats: '4' }).success).toBe(false);
  });
});

describe('defineSlotTablesSchema', () => {
  it('accepts a list of tables', () => {
    expect(defineSlotTablesSchema.safeParse({ tables }).success).toBe(true);
  });

  it('accepts a slot to copy the tables from', () => {
    expect(defineSlotTablesSchema.safeParse({ copyTablesFromSlotId: 3 }).success).toBe(true);
  });

  it('rejects a request with neither tables nor a slot to copy from', () => {
    expect(defineSlotTablesSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a request with both', () => {
    expect(defineSlotTablesSchema.safeParse({ tables, copyTablesFromSlotId: 3 }).success).toBe(
      false,
    );
  });
});

describe('listSlotsQuerySchema', () => {
  it('accepts a valid date', () => {
    expect(listSlotsQuerySchema.safeParse({ date: '2026-11-02' }).success).toBe(true);
  });

  it.each(['2026-02-30', '02/11/2026', ''])('rejects the date "%s"', (date) => {
    expect(listSlotsQuerySchema.safeParse({ date }).success).toBe(false);
  });

  it('rejects a query without date', () => {
    expect(listSlotsQuerySchema.safeParse({}).success).toBe(false);
  });
});
