import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AvailabilityResult } from '@mountain-hut/shared';
import { fetchAvailability } from './availability.ts';
import { ApiError } from './client.ts';

describe('Availability API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const answer = (response: Response) => {
    const fetchMock = vi.fn(() => Promise.resolve(response));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('requests GET /api/availability with date, time, and partySize query params', async () => {
    const payload: AvailabilityResult = {
      available: true,
      date: '2026-11-14',
      time: '12:30',
      partySize: 4,
      slot: { startTime: '12:00', endTime: '13:30' },
      totalFreeSeats: 8,
      tables: [{ tableNumber: 1, seats: 4 }],
      breakdown: [4],
      breakdownText: '4',
    };
    const fetchMock = answer(new Response(JSON.stringify(payload)));

    await expect(
      fetchAvailability({ date: '2026-11-14', time: '12:30', partySize: 4 }),
    ).resolves.toEqual(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/availability?date=2026-11-14&time=12%3A30&partySize=4',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it.each([
    [400, 'Invalid query'],
    [500, 'Internal error'],
  ])('propagates ApiError with status %i on failure', async (status, message) => {
    answer(new Response(JSON.stringify({ message }), { status }));

    const failure = await fetchAvailability({
      date: '2026-11-14',
      time: '12:30',
      partySize: 2,
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status, message });
  });
});
