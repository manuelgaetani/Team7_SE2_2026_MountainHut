import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SlotSummary } from '@mountain-hut/shared';
import { routes } from '../router.tsx';

const user = { id: 1, email: 'hiker@example.test', role: 'HIKER' };
const slot: SlotSummary = {
  id: 1,
  date: '2030-01-15',
  startTime: '19:00',
  endTime: '21:00',
  freeSeats: 6,
  availability: 'AVAILABLE',
};
const booking = {
  id: 9,
  slotId: 1,
  partySize: 3,
  status: 'CONFIRMED',
  tables: [
    { tableNumber: 1, assignedSeats: 2 },
    { tableNumber: 2, assignedSeats: 1 },
  ],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

interface Api {
  me?: () => Response;
  slots?: () => Response;
  book?: () => Response;
}

function stubApi({
  me = () => json(user),
  slots = () => json([slot]),
  book = () => json(booking, 201),
}: Api) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(me());
    if (url === '/api/auth/refresh') return Promise.resolve(json({}, 401));
    if (url === '/api/slots') return Promise.resolve(slots());
    if (url === '/api/bookings') return Promise.resolve(book());
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const router = createMemoryRouter(routes, { initialEntries: ['/book'] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function fillForm(partySize = '3') {
  fireEvent.change(await screen.findByLabelText('Date'), { target: { value: slot.date } });
  fireEvent.change(screen.getByLabelText('Time'), { target: { value: String(slot.id) } });
  fireEvent.change(screen.getByLabelText('Number of people'), { target: { value: partySize } });
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Book' }));

describe('BookingPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks to sign in when there is no session', async () => {
    stubApi({ me: () => json({}, 401) });
    renderPage();
    expect(await screen.findByText(/to book a table/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument();
  });

  it('says so when there are no slots', async () => {
    stubApi({ slots: () => json([]) });
    renderPage();
    expect(await screen.findByText('There are no dates to book yet.')).toBeInTheDocument();
  });

  it('shows an error when the slots cannot be loaded', async () => {
    stubApi({ slots: () => json({}, 500) });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Booking failed');
  });

  it('shows the free seats and disables the slots that cannot be booked', async () => {
    stubApi({
      slots: () =>
        json([
          { ...slot, freeSeats: 1 },
          { ...slot, id: 2, startTime: '12:00', endTime: '14:00', availability: 'FULL' },
          { ...slot, id: 3, startTime: '08:00', endTime: '09:00', availability: 'TOO_LATE' },
        ]),
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: slot.date } });
    expect(screen.getByRole('option', { name: '19:00–21:00 (1 seat left)' })).toBeEnabled();
    expect(screen.getByRole('option', { name: '12:00–14:00 (full)' })).toBeDisabled();
    expect(screen.getByRole('option', { name: '08:00–09:00 (booking closed)' })).toBeDisabled();
  });

  it('requires date, time and number of people', async () => {
    const fetchMock = stubApi({});
    renderPage();
    await screen.findByLabelText('Date');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a date and a time');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/bookings', expect.anything());
  });

  it('books the slot and shows the assigned tables', async () => {
    const fetchMock = stubApi({});
    renderPage();
    await fillForm();
    submit();
    expect(await screen.findByRole('status')).toHaveTextContent('Booking confirmed');
    expect(screen.getByText('Table 1: 2 seats')).toBeInTheDocument();
    expect(screen.getByText('Table 2: 1 seat')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/bookings') as unknown as [
      string,
      { body: string },
    ];
    expect(JSON.parse(call[1].body)).toEqual({ slotId: 1, partySize: 3 });
  });

  it('shows the reason given by the API', async () => {
    const message = 'You already have a booking for this slot';
    stubApi({ book: () => json({ message }, 409) });
    renderPage();
    await fillForm();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('asks to sign in again when the session has expired', async () => {
    stubApi({ book: () => json({ message: 'Not authenticated' }, 401) });
    renderPage();
    await fillForm();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your session has expired');
  });

  it('shows a generic error for an unexpected failure', async () => {
    stubApi({ book: () => json({ message: 'boom' }, 500) });
    renderPage();
    await fillForm();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Booking failed');
  });
});
