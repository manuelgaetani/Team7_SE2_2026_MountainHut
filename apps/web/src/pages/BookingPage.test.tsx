import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SlotSummary } from '@mountain-hut/shared';
import { routes } from '../router.tsx';

// All the texts of the page used by the tests live here: if a label changes in
// BookingPage.tsx, this is the only place to update.
// "confirmed" = taken from the rendered DOM; "check" = verify against BookingPage.tsx.
const TEXT = {
  submit: 'Book your table', // confirmed
  moreGuests: 'More guests', // check: the aria-label of the "+" button must be changed to this
  fewerGuests: 'Fewer guests', // confirmed
  signInPrompt: /to book a table/, // check
  signInLink: 'Sign in', // check
  bookingFailed: 'Booking failed', // check
  noSlots: 'At the moment there are no available time slots.',
  sessionExpired: 'The session has expired',
  summary: 'Tue 15 Jan · 19:00 · 3 people',
  tables: 'Table 1 (2 seats), Table 2 (1 seat)', // check
  oneSeat: 'Table 1 (1 seat)', // check
} as const;

const user = { id: 1, email: 'hiker@example.test', role: 'HIKER' };
const slot: SlotSummary = {
  id: 1,
  date: '2030-01-15',
  startTime: '19:00',
  endTime: '21:00',
  freeSeats: 6,
  availability: 'AVAILABLE',
};
// A new booking is created as PENDING: it is confirmed later.
const booking = {
  id: 9,
  slotId: 1,
  partySize: 3,
  status: 'PENDING',
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

const clickGuests = (name: typeof TEXT.moreGuests | typeof TEXT.fewerGuests) =>
  fireEvent.click(screen.getByRole('button', { name }));

// The first day is already selected: only guests and time need to be chosen.
async function fillForm(guests = 3) {
  await screen.findByRole('radio', { name: '19:00' });
  for (let n = DEFAULT_GUESTS; n < guests; n++) clickGuests(TEXT.moreGuests);
  for (let n = DEFAULT_GUESTS; n > guests; n--) clickGuests(TEXT.fewerGuests);
  fireEvent.click(screen.getByRole('radio', { name: '19:00' }));
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));

describe('BookingPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks to sign in when there is no session', async () => {
    stubApi({ me: () => json({}, 401) });
    renderPage();
    expect(await screen.findByText(TEXT.signInPrompt)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: TEXT.signInLink })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('says so when there are no slots', async () => {
    stubApi({ slots: () => json([]) });
    renderPage();
    expect(await screen.findByText(TEXT.noSlots)).toBeInTheDocument();
  });

  it('shows an error when the slots cannot be loaded', async () => {
    stubApi({ slots: () => json({}, 500) });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.bookingFailed);
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
      slots: () =>
        json([slot, { ...slot, id: 2, startTime: '20:00', endTime: '22:00', freeSeats: 2 }]),
    });
    renderPage();
    expect(await screen.findByRole('radio', { name: '20:00' })).toBeEnabled();
    clickGuests(TEXT.moreGuests);
    expect(screen.getByRole('radio', { name: '20:00' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: '19:00' })).toBeEnabled();
  });

  it('keeps the booking button disabled until a time is chosen', async () => {
    const fetchMock = stubApi({});
    renderPage();
    const button = await screen.findByRole('button', { name: TEXT.submit });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: '19:00' }));
    expect(button).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/bookings', expect.anything());
  });

  it('sends the booking request and shows that it is waiting for confirmation', async () => {
    const fetchMock = stubApi({});
    renderPage();
    await fillForm();
    submit();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Booking request sent');
    expect(dialog).toHaveTextContent('Awaiting confirmation');
    expect(dialog).toHaveTextContent(TEXT.summary);
    expect(screen.getByText(TEXT.tables)).toBeInTheDocument();
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
    expect(await screen.findByText(TEXT.oneSeat)).toBeInTheDocument();
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
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.sessionExpired);
  });

  it('shows a generic error for an unexpected failure', async () => {
    stubApi({ book: () => json({ message: 'boom' }, 500) });
    renderPage();
    await fillForm();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.bookingFailed);
  });
});