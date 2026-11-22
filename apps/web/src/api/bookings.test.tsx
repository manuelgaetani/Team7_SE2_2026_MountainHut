import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookingResult, MyBooking, SlotSummary } from '@mountain-hut/shared';
import { changeBooking, createBooking, fetchMyBookings, fetchSlots } from './bookings.ts';
import { ApiError } from './client.ts';
import { MY_BOOKINGS_KEY, SLOTS_KEY, useChangeBooking, useCreateBooking } from './useBookings.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const TEXT = {
  createBtn: 'Trigger create',
  changeBtn: 'Trigger change',
  ok: 'OK',
  err: 'ERR',
} as const;

const sampleBookingResult: BookingResult = {
  id: 10,
  slotId: 3,
  partySize: 4,
  requirements: [{ allergies: true, description: 'no nuts' }],
  status: 'CONFIRMED',
  tables: [{ tableNumber: 1, assignedSeats: 4 }],
};

describe('Bookings API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const answer = (response: Response) => {
    const fetchMock = vi.fn(() => Promise.resolve(response));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('fetches bookable slots', async () => {
    const slots: SlotSummary[] = [
      {
        id: 1,
        date: '2026-11-21',
        startTime: '12:00',
        endTime: '13:30',
        freeSeats: 6,
        availability: 'AVAILABLE',
      },
    ];
    const fetchMock = answer(json(slots));
    await expect(fetchSlots()).resolves.toEqual(slots);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/slots',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('posts a new booking', async () => {
    const input = {
      slotId: 3,
      partySize: 4,
      requirements: [{ allergies: true, description: 'no nuts' }],
    };
    const fetchMock = answer(json(sampleBookingResult, 201));
    await expect(createBooking(input)).resolves.toEqual(sampleBookingResult);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bookings',
      expect.objectContaining({
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  });

  it('fetches upcoming bookings of the logged hiker', async () => {
    const mine: MyBooking[] = [
      {
        id: 10,
        slotId: 3,
        date: '2026-11-21',
        startTime: '12:00',
        endTime: '13:30',
        partySize: 4,
        requirements: [],
        status: 'CONFIRMED',
      },
    ];
    const fetchMock = answer(json(mine));
    await expect(fetchMyBookings()).resolves.toEqual(mine);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bookings/me',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('patches a booking change with the changed fields', async () => {
    const input = { slotId: 5, partySize: 6, requirements: [] };
    const fetchMock = answer(json({ ...sampleBookingResult, ...input }));
    await expect(changeBooking(10, input)).resolves.toEqual({ ...sampleBookingResult, ...input });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bookings/10',
      expect.objectContaining({
        method: 'PATCH',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  });

  it.each([401, 403, 404, 409, 422])(
    'propagates ApiError status %i and message when changeBooking fails',
    async (status) => {
      const message = `Failure ${status}`;
      answer(json({ message }, status));
      const failure = await changeBooking(10, { partySize: 2 }).catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(ApiError);
      expect(failure).toMatchObject({ status, message });
    },
  );
});

describe('Booking mutation hooks (QueryClient cache lifecycle)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderWithClient(ui: ReactElement) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
    return { invalidateSpy };
  }

  function ChangeHarness() {
    const mutation = useChangeBooking();
    return (
      <div>
        <button type="button" onClick={() => mutation.mutate({ id: 7, input: { partySize: 5 } })}>
          {TEXT.changeBtn}
        </button>
        {mutation.isSuccess && <span>{TEXT.ok}</span>}
        {mutation.isError && <span>{TEXT.err}</span>}
      </div>
    );
  }

  function CreateHarness() {
    const mutation = useCreateBooking();
    return (
      <div>
        <button type="button" onClick={() => mutation.mutate({ slotId: 3, partySize: 2 })}>
          {TEXT.createBtn}
        </button>
        {mutation.isSuccess && <span>{TEXT.ok}</span>}
        {mutation.isError && <span>{TEXT.err}</span>}
      </div>
    );
  }

  it('useChangeBooking invalidates both bookings/me and slots on success', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json(sampleBookingResult)));
    vi.stubGlobal('fetch', fetchMock);
    const { invalidateSpy } = renderWithClient(<ChangeHarness />);

    fireEvent.click(screen.getByRole('button', { name: TEXT.changeBtn }));
    expect(await screen.findByText(TEXT.ok)).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bookings/7',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ partySize: 5 }) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: MY_BOOKINGS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SLOTS_KEY });
  });

  it.each([409, 422])(
    'useChangeBooking does not invalidate caches when the API rejects with %i',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(json({ message: 'Rejected' }, status))),
      );
      const { invalidateSpy } = renderWithClient(<ChangeHarness />);

      fireEvent.click(screen.getByRole('button', { name: TEXT.changeBtn }));
      expect(await screen.findByText(TEXT.err)).toBeInTheDocument();
      expect(invalidateSpy).not.toHaveBeenCalled();
    },
  );

  it('useCreateBooking invalidates slots on both success and failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json(sampleBookingResult, 201))
        .mockResolvedValueOnce(json({ message: 'Conflict' }, 409)),
    );
    const { invalidateSpy } = renderWithClient(<CreateHarness />);

    fireEvent.click(screen.getByRole('button', { name: TEXT.createBtn }));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).toHaveBeenLastCalledWith({ queryKey: SLOTS_KEY });

    fireEvent.click(screen.getByRole('button', { name: TEXT.createBtn }));
    expect(await screen.findByText(TEXT.err)).toBeInTheDocument();
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(2));
    expect(invalidateSpy).toHaveBeenLastCalledWith({ queryKey: SLOTS_KEY });
  });
});
