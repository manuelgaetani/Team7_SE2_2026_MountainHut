import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FloorPlan } from '@mountain-hut/shared';
import { routes } from '../router.tsx';

const TEXT = {
  backLink: 'Back to the time slots',
  loading: 'Loading the floor plan…',
  notFound: 'Slot not found',
  loadFailed: 'The floor plan could not be loaded. Please try again.',
  sessionExpired: 'The session has expired. Please log in again.',
  staffOnly: 'This page is for the hut staff.',
  logInHint: /with a staff account to see the floor plan/,
  noTables: 'No tables yet: hikers cannot book this slot.',
  noBookings: 'No bookings yet: every seat is free.',
  assignment: 'Group assignment',
} as const;

const employeeUser = { id: 2, email: 'employee@hut.test', role: 'EMPLOYEE' };
const wardenUser = { id: 3, email: 'warden@hut.test', role: 'WARDEN' };
const hikerUser = { id: 1, email: 'hiker@example.test', role: 'HIKER' };

const slot = { id: 5, date: '2026-11-14', startTime: '12:30', endTime: '13:30' };

// A confirmed, a confirmed group split over two tables, and a pending one that booked
// the overlapping slot 12:00–13:00.
const fullPlan: FloorPlan = {
  slot,
  tables: [
    {
      tableNumber: 1,
      capacity: 4,
      occupiedSeats: 4,
      freeSeats: 0,
      groups: [{ label: 'A', seats: 4 }],
    },
    {
      tableNumber: 2,
      capacity: 4,
      occupiedSeats: 2,
      freeSeats: 2,
      groups: [{ label: 'C', seats: 2 }],
    },
    {
      tableNumber: 4,
      capacity: 6,
      occupiedSeats: 6,
      freeSeats: 0,
      groups: [{ label: 'B', seats: 6 }],
    },
    {
      tableNumber: 5,
      capacity: 6,
      occupiedSeats: 2,
      freeSeats: 4,
      groups: [{ label: 'B', seats: 2 }],
    },
  ],
  groups: [
    {
      label: 'A',
      bookingId: 1,
      fullName: 'Rossi',
      partySize: 4,
      status: 'CONFIRMED',
      startTime: '12:30',
      endTime: '13:30',
      tables: [{ tableNumber: 1, seats: 4 }],
    },
    {
      label: 'B',
      bookingId: 2,
      fullName: 'Ferrari',
      partySize: 8,
      status: 'CONFIRMED',
      startTime: '12:30',
      endTime: '13:30',
      tables: [
        { tableNumber: 4, seats: 6 },
        { tableNumber: 5, seats: 2 },
      ],
    },
    {
      label: 'C',
      bookingId: 3,
      fullName: 'Bianchi',
      partySize: 2,
      status: 'PENDING',
      startTime: '12:00',
      endTime: '13:00',
      tables: [{ tableNumber: 2, seats: 2 }],
    },
  ],
  totals: { capacity: 20, occupiedSeats: 14, freeSeats: 6, confirmedGroups: 2, splitGroups: 1 },
};

const emptyPlan: FloorPlan = {
  slot,
  tables: [
    { tableNumber: 1, capacity: 4, occupiedSeats: 0, freeSeats: 4, groups: [] },
    { tableNumber: 2, capacity: 4, occupiedSeats: 0, freeSeats: 4, groups: [] },
  ],
  groups: [],
  totals: { capacity: 8, occupiedSeats: 0, freeSeats: 8, confirmedGroups: 0, splitGroups: 0 },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

interface MockApiOptions {
  user?: unknown;
  floor?: (id: string) => Response | Promise<Response>;
}

function stubApi({ user = employeeUser, floor = () => json(fullPlan) }: MockApiOptions = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(user ? json(user) : json({}, 401));
    if (url === '/api/auth/refresh') return Promise.resolve(json({}, 401));
    const match = url.match(/^\/api\/slots\/(\d+)\/floor$/);
    if (match) return Promise.resolve(floor(match[1]!));
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderFloorPage(
  entry: string | { pathname: string; state?: unknown } = '/staff/slots/5/floor',
) {
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const floorRequests = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('/floor'));

// The card of the summary with this label.
const card = (label: string) => within(screen.getByText(label).closest('li') as HTMLElement);
const tableCard = (n: number) => screen.getByText(`Table ${n}`).closest('li') as HTMLElement;

describe('FloorPlanPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('who can see it', () => {
    it('prompts unauthenticated visitors to log in, without asking for the plan', async () => {
      const fetchMock = stubApi({ user: null });
      renderFloorPage();

      const loginLink = await screen.findByRole('link', { name: 'Log in' }, { timeout: 4000 });
      expect(loginLink).toHaveAttribute('href', '/login');
      expect(screen.getByText(TEXT.logInHint)).toBeInTheDocument();
      expect(floorRequests(fetchMock)).toHaveLength(0);
    });

    it('forbids hikers, without asking for the plan', async () => {
      const fetchMock = stubApi({ user: hikerUser });
      renderFloorPage();

      expect(await screen.findByText(TEXT.staffOnly)).toBeInTheDocument();
      expect(screen.queryByLabelText('Tables of the slot')).not.toBeInTheDocument();
      expect(floorRequests(fetchMock)).toHaveLength(0);
    });

    it.each([
      ['an employee', employeeUser],
      ['a warden', wardenUser],
    ])('shows the plan to %s', async (_name, user) => {
      const fetchMock = stubApi({ user });
      renderFloorPage();

      expect(await screen.findByLabelText('Tables of the slot')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Floor plan' })).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith('/api/slots/5/floor', expect.anything());
    });
  });

  describe('states of the request', () => {
    it('shows a status while the plan is loading', async () => {
      stubApi({ floor: () => new Promise<Response>(() => {}) });
      renderFloorPage();

      expect(await screen.findByRole('status')).toHaveTextContent(TEXT.loading);
    });

    it('says the slot is not found on a 404', async () => {
      stubApi({ floor: () => json({ message: 'Slot not found' }, 404) });
      renderFloorPage('/staff/slots/99/floor');

      expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.notFound);
    });

    it('asks to log in again when the session has expired', async () => {
      stubApi({ floor: () => json({ message: 'Unauthorized' }, 401) });
      renderFloorPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.sessionExpired);
    });

    it('shows a generic error on a 500', async () => {
      stubApi({ floor: () => json({ message: 'boom' }, 500) });
      renderFloorPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.loadFailed);
    });

    it.each(['abc', '0', '-3', '1.5', '2147483648'])(
      'says the slot is not found for the id "%s" in the URL, without asking the API',
      async (id) => {
        const fetchMock = stubApi();
        renderFloorPage(`/staff/slots/${id}/floor`);

        expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.notFound);
        expect(floorRequests(fetchMock)).toHaveLength(0);
      },
    );
  });

  describe('slots without tables or bookings', () => {
    it('says that a slot without tables cannot be booked', async () => {
      stubApi({
        floor: () =>
          json({
            ...emptyPlan,
            tables: [],
            totals: { ...emptyPlan.totals, capacity: 0, freeSeats: 0 },
          }),
      });
      renderFloorPage();

      expect(await screen.findByText(TEXT.noTables)).toBeInTheDocument();
      expect(screen.queryByLabelText('Tables of the slot')).not.toBeInTheDocument();
    });

    it('shows every seat free when nobody has booked', async () => {
      stubApi({ floor: () => json(emptyPlan) });
      renderFloorPage();

      expect(await screen.findByText(TEXT.noBookings)).toBeInTheDocument();
      expect(card('seats taken').getByText('0 / 8')).toBeInTheDocument();
      expect(card('free seats').getByText('8')).toBeInTheDocument();
      expect(screen.queryAllByRole('button', { name: /^Group / })).toHaveLength(0);
    });
  });

  describe('the plan', () => {
    it('shows the day and the time of the slot', async () => {
      stubApi();
      renderFloorPage();

      expect(await screen.findByText(/14 Nov · 12:30–13:30/)).toBeInTheDocument();
    });

    it('shows the four cards with the numbers of the slot', async () => {
      stubApi();
      renderFloorPage();
      await screen.findByLabelText('Tables of the slot');

      expect(card('seats taken').getByText('14 / 20')).toBeInTheDocument();
      expect(card('free seats').getByText('6')).toBeInTheDocument();
      expect(card('confirmed groups').getByText('2')).toBeInTheDocument();
      expect(card('groups on more than one table').getByText('1')).toBeInTheDocument();
    });

    it('lists the tables by number with their seats', async () => {
      stubApi();
      renderFloorPage();
      await screen.findByLabelText('Tables of the slot');

      const tables = screen.getAllByRole('heading', { level: 3, name: /^Table / });
      expect(tables.map((t) => t.textContent)).toEqual([
        'Table 1',
        'Table 2',
        'Table 4',
        'Table 5',
      ]);
      expect(within(tableCard(1)).getByText('full')).toBeInTheDocument();
      expect(within(tableCard(2)).getByText('2 / 4 taken')).toBeInTheDocument();
      expect(within(tableCard(5)).getByText('2 / 6 taken')).toBeInTheDocument();
    });

    it('shows a group on two tables with the same letter on both', async () => {
      stubApi();
      renderFloorPage();
      await screen.findByLabelText('Tables of the slot');

      const atTable4 = within(tableCard(4)).getAllByRole('button', {
        name: 'Group B, table 4, 6 seats',
      });
      const atTable5 = within(tableCard(5)).getAllByRole('button', {
        name: 'Group B, table 5, 2 seats',
      });
      expect(atTable4).toHaveLength(6);
      expect(atTable5).toHaveLength(2);
      for (const seat of [...atTable4, ...atTable5]) expect(seat).toHaveTextContent('B');
      expect(within(tableCard(5)).getByText(/6 seats in total, 4 free/)).toBeInTheDocument();
    });

    it('lists the groups with their people, tables and the time of another slot', async () => {
      stubApi();
      renderFloorPage();
      await screen.findByLabelText('Groups of the slot');

      const ferrari = screen.getByRole('button', { name: 'Group B, Ferrari' });
      expect(ferrari).toHaveTextContent('Ferrari · 8 people');
      expect(ferrari).toHaveTextContent('T4 · 6 + T5 · 2');
      expect(ferrari).toHaveTextContent('on 2 tables');

      const rossi = screen.getByRole('button', { name: 'Group A, Rossi' });
      expect(rossi).toHaveTextContent('Rossi · 4 people');
      expect(rossi).not.toHaveTextContent(/Slot /);

      expect(screen.getByRole('button', { name: 'Group C, Bianchi' })).toHaveTextContent(
        'Slot 12:00–13:00',
      );
    });

    it('marks a pending group, which holds seats but is not a confirmed group', async () => {
      stubApi();
      renderFloorPage();
      await screen.findByLabelText('Groups of the slot');

      expect(screen.getByRole('button', { name: 'Group C, Bianchi' })).toHaveTextContent('pending');
      expect(screen.getByRole('button', { name: 'Group A, Rossi' })).not.toHaveTextContent(
        'pending',
      );
      expect(within(tableCard(2)).getAllByRole('button', { name: /^Group C/ })).toHaveLength(2);
      expect(card('confirmed groups').getByText('2')).toBeInTheDocument();
    });
  });

  describe('selecting a group', () => {
    it('highlights all its tables when its row is selected', async () => {
      stubApi();
      renderFloorPage();
      await screen.findByLabelText('Groups of the slot');

      const row = screen.getByRole('button', { name: 'Group B, Ferrari' });
      expect(row).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByText(TEXT.assignment)).not.toBeInTheDocument();

      fireEvent.click(row);

      expect(row).toHaveAttribute('aria-pressed', 'true');
      expect(tableCard(4)).toHaveClass('floor-table--selected');
      expect(tableCard(5)).toHaveClass('floor-table--selected');
      expect(tableCard(1)).not.toHaveClass('floor-table--selected');
      expect(tableCard(2)).not.toHaveClass('floor-table--selected');
      for (const seat of screen.getAllByRole('button', { name: /^Group B, table/ })) {
        expect(seat).toHaveAttribute('aria-pressed', 'true');
      }
      expect(screen.getByText(TEXT.assignment)).toBeInTheDocument();
      expect(screen.getByText('6 people')).toBeInTheDocument();
      expect(screen.getByText('2 people')).toBeInTheDocument();
    });

    it('selects the group of a seat that is clicked', async () => {
      stubApi();
      renderFloorPage();
      await screen.findByLabelText('Tables of the slot');

      fireEvent.click(screen.getAllByRole('button', { name: 'Group A, table 1, 4 seats' })[0]!);

      expect(screen.getByRole('button', { name: 'Group A, Rossi' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(tableCard(1)).toHaveClass('floor-table--selected');
      expect(tableCard(4)).not.toHaveClass('floor-table--selected');
    });

    it('clears the selection when the same group is selected again', async () => {
      stubApi();
      renderFloorPage();
      await screen.findByLabelText('Groups of the slot');

      const row = screen.getByRole('button', { name: 'Group B, Ferrari' });
      fireEvent.click(row);
      fireEvent.click(row);

      expect(row).toHaveAttribute('aria-pressed', 'false');
      expect(tableCard(4)).not.toHaveClass('floor-table--selected');
    });

    it('moves the selection to another group', async () => {
      stubApi();
      renderFloorPage();
      await screen.findByLabelText('Groups of the slot');

      fireEvent.click(screen.getByRole('button', { name: 'Group B, Ferrari' }));
      fireEvent.click(screen.getByRole('button', { name: 'Group A, Rossi' }));

      expect(screen.getByRole('button', { name: 'Group B, Ferrari' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(tableCard(1)).toHaveClass('floor-table--selected');
      expect(tableCard(4)).not.toHaveClass('floor-table--selected');
    });
  });

  describe('going back', () => {
    it('goes back to the time slots', async () => {
      stubApi();
      renderFloorPage();

      expect(await screen.findByRole('link', { name: TEXT.backLink })).toHaveAttribute(
        'href',
        '/staff/slots',
      );
    });

    it('goes back to the day the staff came from', async () => {
      stubApi();
      renderFloorPage({ pathname: '/staff/slots/5/floor', state: { date: '2026-11-14' } });

      expect(await screen.findByRole('link', { name: TEXT.backLink })).toHaveAttribute(
        'href',
        '/staff/slots?date=2026-11-14',
      );
    });

    it.each(['2026-02-31', 'tomorrow', 20261114])(
      'ignores the day %s, which is not a date',
      async (date) => {
        stubApi();
        renderFloorPage({ pathname: '/staff/slots/5/floor', state: { date } });

        expect(await screen.findByRole('link', { name: TEXT.backLink })).toHaveAttribute(
          'href',
          '/staff/slots',
        );
      },
    );
  });
});
