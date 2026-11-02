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

const DEFAULT_GUESTS = 2;

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

const clickGuests = (name: 'Più ospiti' | 'Meno ospiti') =>
  fireEvent.click(screen.getByRole('button', { name }));

// The first day is already selected: only guests and time need to be chosen.
async function fillForm(guests = 3) {
  await screen.findByRole('radio', { name: '19:00' });
  for (let n = DEFAULT_GUESTS; n < guests; n++) clickGuests('Più ospiti');
  for (let n = DEFAULT_GUESTS; n > guests; n--) clickGuests('Meno ospiti');
  fireEvent.click(screen.getByRole('radio', { name: '19:00' }));
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Prenota il tuo tavolo' }));

describe('BookingPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks to sign in when there is no session', async () => {
    stubApi({ me: () => json({}, 401) });
    renderPage();
    expect(await screen.findByText(/per prenotare un tavolo/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Accedi' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('says so when there are no slots', async () => {
    stubApi({ slots: () => json([]) });
    renderPage();
    expect(
      await screen.findByText('Al momento non ci sono orari prenotabili.'),
    ).toBeInTheDocument();
  });

  it('shows an error when the slots cannot be loaded', async () => {
    stubApi({ slots: () => json({}, 500) });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Prenotazione non riuscita');
  });

  it('disables the slots that cannot be booked', async () => {
    stubApi({
      slots: () =>
        json([
          { ...slot, freeSeats: 1 },
          { ...slot, id: 2, startTime: '12:00', endTime: '14:00', availability: 'FULL' },
          { ...slot, id: 3, startTime: '08:00', endTime: '09:00', availability: 'TOO_LATE' },
        ]),
    });
    renderPage();
    expect(await screen.findByRole('radio', { name: '19:00' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: '12:00' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: '08:00' })).toBeDisabled();
  });

  it('disables the slots with fewer free seats than guests', async () => {
    stubApi({
      slots: () => json([slot, { ...slot, id: 2, startTime: '20:00', endTime: '22:00', freeSeats: 2 }]),
    });
    renderPage();
    expect(await screen.findByRole('radio', { name: '20:00' })).toBeEnabled();
    clickGuests('Più ospiti');
    expect(screen.getByRole('radio', { name: '20:00' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: '19:00' })).toBeEnabled();
  });

  it('keeps the booking button disabled until a time is chosen', async () => {
    const fetchMock = stubApi({});
    renderPage();
    const button = await screen.findByRole('button', { name: 'Prenota il tuo tavolo' });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: '19:00' }));
    expect(button).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/bookings', expect.anything());
  });

  it('books the slot and shows the assigned tables', async () => {
    const fetchMock = stubApi({});
    renderPage();
    await fillForm();
    submit();
    expect(
      await screen.findByText(/Prenotazione confermata per Mar 15 gen alle 19:00/),
    ).toBeInTheDocument();
    expect(screen.getByText('Tavolo 1 (2 posti), Tavolo 2 (1 posto)')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/bookings') as unknown as [
      string,
      { body: string },
    ];
    expect(JSON.parse(call[1].body)).toEqual({ slotId: 1, partySize: 3 });
  });

  it('uses the singular for one seat', async () => {
    stubApi({
      book: () =>
        json({ ...booking, partySize: 1, tables: [{ tableNumber: 1, assignedSeats: 1 }] }, 201),
    });
    renderPage();
    await fillForm(1);
    submit();
    expect(await screen.findByText('Tavolo 1 (1 posto)')).toBeInTheDocument();
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
    expect(await screen.findByRole('alert')).toHaveTextContent('La sessione è scaduta');
  });

  it('shows a generic error for an unexpected failure', async () => {
    stubApi({ book: () => json({ message: 'boom' }, 500) });
    renderPage();
    await fillForm();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Prenotazione non riuscita');
  });
});