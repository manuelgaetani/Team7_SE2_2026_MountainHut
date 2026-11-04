import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSlot, defineSlotTables, fetchSchedule } from './slots.ts';

describe('Slots API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const answer = (response: Response) => {
    const fetchMock = vi.fn(() => Promise.resolve(response));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('fetches schedule for a given date', async () => {
    const slots = [
      {
        id: 1,
        date: '2026-11-04',
        startTime: '12:00',
        endTime: '13:00',
        tables: [{ tableNumber: 1, seats: 4 }],
        totalSeats: 4,
      },
    ];
    const fetchMock = answer(new Response(JSON.stringify(slots)));
    const result = await fetchSchedule('2026-11-04');
    expect(result).toEqual(slots);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/slots/schedule?date=2026-11-04',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('posts a new slot', async () => {
    const newSlot = {
      date: '2026-11-04',
      startTime: '12:00',
      endTime: '13:00',
      tables: [{ tableNumber: 1, seats: 4 }],
    };
    const created = { id: 1, ...newSlot, totalSeats: 4 };
    const fetchMock = answer(new Response(JSON.stringify(created)));
    const result = await createSlot(newSlot);
    expect(result).toEqual(created);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/slots',
      expect.objectContaining({
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(newSlot),
      }),
    );
  });

  it('puts tables definition for an existing slot', async () => {
    const input = {
      tables: [{ tableNumber: 1, seats: 4 }],
    };
    const updated = {
      id: 5,
      date: '2026-11-04',
      startTime: '12:00',
      endTime: '13:00',
      tables: input.tables,
      totalSeats: 4,
    };
    const fetchMock = answer(new Response(JSON.stringify(updated)));
    const result = await defineSlotTables(5, input);
    expect(result).toEqual(updated);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/slots/5/tables',
      expect.objectContaining({
        method: 'PUT',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  });
});
