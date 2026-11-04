import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client.ts';
import {
  emptyTablesChoice,
  nextTableNumber,
  seatsLabel,
  slotErrorMessage,
  tablesLabel,
  toTablesSource,
} from './slotTables.ts';
import type { TableDraft } from './slotTables.ts';

const rows = (...pairs: [string, string][]): TableDraft[] =>
  pairs.map(([tableNumber, seats]) => ({ tableNumber, seats }));
const list = (tableRows: TableDraft[]) => ({
  ...emptyTablesChoice(),
  mode: 'list' as const,
  rows: tableRows,
});
const INVALID_ROW = 'Every table needs a number and its seats, both above zero.';

describe('toTablesSource', () => {
  it('asks for no tables when they are added later', () => {
    expect(toTablesSource({ ...emptyTablesChoice(), mode: 'later' })).toEqual({
      ok: true,
      source: {},
    });
  });

  it('needs a slot to copy from, and sends its id', () => {
    const copy = { ...emptyTablesChoice(), mode: 'copy' as const };
    expect(toTablesSource(copy)).toEqual({
      ok: false,
      error: 'Choose the slot to copy the tables from.',
    });
    expect(toTablesSource({ ...copy, copyFromSlotId: 3 })).toEqual({
      ok: true,
      source: { copyTablesFromSlotId: 3 },
    });
  });

  it('turns the typed rows into numbers', () => {
    expect(toTablesSource(list(rows(['1', '4'], ['2', '6'])))).toEqual({
      ok: true,
      source: {
        tables: [
          { tableNumber: 1, seats: 4 },
          { tableNumber: 2, seats: 6 },
        ],
      },
    });
  });

  it.each(['', '0', '-1', '1.5', 'abc'])('rejects "%s" as the seats', (seats) => {
    expect(toTablesSource(list(rows(['1', seats])))).toEqual({ ok: false, error: INVALID_ROW });
  });

  it('rejects a table number of zero', () => {
    expect(toTablesSource(list(rows(['0', '4'])))).toEqual({ ok: false, error: INVALID_ROW });
  });

  it('rejects two tables with the same number', () => {
    expect(toTablesSource(list(rows(['1', '4'], ['1', '6'])))).toEqual({
      ok: false,
      error: 'Two tables have the same number.',
    });
  });

  it('asks for at least one table when the list is empty', () => {
    expect(toTablesSource(list([]))).toEqual({ ok: false, error: 'Add at least one table.' });
  });
});

describe('nextTableNumber', () => {
  it('starts from 1 and continues after the highest number', () => {
    expect(nextTableNumber([])).toBe('1');
    expect(nextTableNumber(rows(['1', ''], ['2', ''], ['5', '']))).toBe('6');
  });

  it('ignores a number that is not a valid integer', () => {
    expect(nextTableNumber(rows(['abc', '']))).toBe('1');
  });
});

describe('slotErrorMessage', () => {
  it('asks to log in again when the session has expired', () => {
    expect(slotErrorMessage(new ApiError(401, 'Unauthorized'))).toBe(
      'The session has expired. Please log in again.',
    );
  });

  it.each([403, 404, 409, 422])('shows the message of the API for a %s', (status) => {
    expect(slotErrorMessage(new ApiError(status, 'Explained by the API'))).toBe(
      'Explained by the API',
    );
  });

  it('shows a generic message for any other failure', () => {
    expect(slotErrorMessage(new ApiError(500, 'boom'))).toBe('Saving failed. Please try again.');
    expect(slotErrorMessage(new Error('network'))).toBe('Saving failed. Please try again.');
  });
});

describe('labels', () => {
  it('uses the singular only for one', () => {
    expect(seatsLabel(1)).toBe('1 seat');
    expect(seatsLabel(0)).toBe('0 seats');
    expect(tablesLabel(1)).toBe('1 table');
    expect(tablesLabel(3)).toBe('3 tables');
  });
});