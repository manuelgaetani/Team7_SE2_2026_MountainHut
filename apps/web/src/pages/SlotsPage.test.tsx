import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SlotDetails } from '@mountain-hut/shared';
import { routes } from '../router.tsx';

const employeeUser = { id: 2, email: 'employee@hut.test', role: 'EMPLOYEE' };
const wardenUser = { id: 3, email: 'warden@hut.test', role: 'WARDEN' };
const hikerUser = { id: 1, email: 'hiker@example.test', role: 'HIKER' };

const slotWithTables: SlotDetails = {
  id: 1,
  date: '2026-11-04',
  startTime: '12:00',
  endTime: '13:00',
  tables: [
    { tableNumber: 1, seats: 4 },
    { tableNumber: 2, seats: 2 },
  ],
  totalSeats: 6,
};

const emptySlot: SlotDetails = {
  id: 2,
  date: '2026-11-04',
  startTime: '19:30',
  endTime: '21:00',
  tables: [],
  totalSeats: 0,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

interface MockApiOptions {
  user?: unknown;
  schedule?: Record<string, SlotDetails[]>;
  postSlotHandler?: (body: unknown) => Response;
  putTablesHandler?: (id: string, body: unknown) => Response;
}

function stubSlotsApi({
  user = employeeUser,
  schedule = { '2026-11-04': [slotWithTables, emptySlot] },
  postSlotHandler = (body) => json({ id: 99, ...(body as object), totalSeats: 6 }, 201),
  putTablesHandler = (id, body) =>
    json({ ...emptySlot, id: Number(id), ...(body as object), totalSeats: 4 }, 200),
}: MockApiOptions = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') {
      return Promise.resolve(user ? json(user) : json({}, 401));
    }
    if (url === '/api/auth/refresh') {
      return Promise.resolve(json({}, 401));
    }
    if (url.startsWith('/api/slots/schedule')) {
      const parsedUrl = new URL(url, 'http://localhost');
      const date = parsedUrl.searchParams.get('date') ?? '2026-11-04';
      const daySlots = schedule[date] ?? [];
      return Promise.resolve(json(daySlots));
    }
    if (url === '/api/slots' && init?.method === 'POST') {
      const parsed = init.body ? JSON.parse(init.body as string) : {};
      return Promise.resolve(postSlotHandler(parsed));
    }
    const putMatch = url.match(/^\/api\/slots\/(\d+)\/tables$/);
    if (putMatch && init?.method === 'PUT') {
      const parsed = init.body ? JSON.parse(init.body as string) : {};
      return Promise.resolve(putTablesHandler(putMatch[1], parsed));
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderSlotsPage() {
  const router = createMemoryRouter(routes, { initialEntries: ['/staff/slots'] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('SlotsPage', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('prompts unauthenticated visitors to log in', async () => {
    stubSlotsApi({ user: null });
    renderSlotsPage();

    const loginLink = await screen.findByRole('link', { name: 'Log in' }, { timeout: 4000 });
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute('href', '/login');
    expect(screen.getByText(/with a staff account to manage the time slots/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument();
  });

  it('forbids standard hikers without staff privileges', async () => {
    stubSlotsApi({ user: hikerUser });
    renderSlotsPage();

    expect(await screen.findByText('This page is for the hut staff.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument();
  });

  it('allows warden staff to view and manage slots', async () => {
    stubSlotsApi({ user: wardenUser });
    renderSlotsPage();

    expect(await screen.findByLabelText('Day')).toBeInTheDocument();
    expect(screen.getByText('Time slots and tables')).toBeInTheDocument();
  });

  it('shows an empty schedule notice when no slots exist for the date', async () => {
    stubSlotsApi({ schedule: { '2026-11-04': [] } });
    renderSlotsPage();

    expect(await screen.findByText('No time slots on this day yet.')).toBeInTheDocument();
  });

  it('displays the slots of the day with tables, seat counts, and define tables action', async () => {
    stubSlotsApi();
    renderSlotsPage();

    expect(await screen.findByText('12:00–13:00')).toBeInTheDocument();
    expect(screen.getByText('2 tables · 6 seats')).toBeInTheDocument();
    expect(screen.getByText('Table 1 · 4 seats')).toBeInTheDocument();
    expect(screen.getByText('Table 2 · 2 seats')).toBeInTheDocument();

    expect(screen.getByText('19:30–21:00')).toBeInTheDocument();
    expect(screen.getByText('0 tables · 0 seats')).toBeInTheDocument();
    expect(screen.getByText('No tables yet: hikers cannot book this slot.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Define the tables of 19:30–21:00' }),
    ).toBeInTheDocument();
  });

  it('ignores clearing the day input value', async () => {
    stubSlotsApi();
    renderSlotsPage();

    const dayInput = await screen.findByLabelText('Day');
    fireEvent.change(dayInput, { target: { value: '' } });
    expect(dayInput).toHaveValue('2026-11-04');
  });

  it('shows an error notice when schedule loading fails', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/auth/me') return Promise.resolve(json(employeeUser));
      if (url.startsWith('/api/slots/schedule')) return Promise.resolve(json({}, 500));
      return Promise.resolve(json({}, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSlotsPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Saving failed. Please try again.');
  });

  it('allows changing the day to view another date schedule', async () => {
    const tomorrowSlot: SlotDetails = {
      id: 3,
      date: '2026-11-05',
      startTime: '11:00',
      endTime: '12:00',
      tables: [{ tableNumber: 1, seats: 2 }],
      totalSeats: 2,
    };
    const fetchMock = stubSlotsApi({
      schedule: {
        '2026-11-04': [slotWithTables],
        '2026-11-05': [tomorrowSlot],
      },
    });

    renderSlotsPage();

    expect(await screen.findByText('12:00–13:00')).toBeInTheDocument();

    const dayInput = screen.getByLabelText('Day');
    fireEvent.change(dayInput, { target: { value: '2026-11-05' } });

    expect(await screen.findByText('11:00–12:00')).toBeInTheDocument();
    expect(screen.queryByText('12:00–13:00')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/slots/schedule?date=2026-11-05',
      expect.anything(),
    );
  });

  it('validates required fields and time order in NewSlotForm', async () => {
    stubSlotsApi();
    renderSlotsPage();

    await screen.findByText('12:00–13:00');

    const submitBtn = screen.getByRole('button', { name: /Create the slot/ });

    // Missing times
    fireEvent.click(submitBtn);
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the start and the end time.');

    // End time <= start time
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '13:00' } });
    fireEvent.click(submitBtn);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The end time must be after the start time.',
    );

    // Invalid table seats (empty)
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '15:00' } });
    fireEvent.click(submitBtn);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Every table needs a number and its seats, both above zero.',
    );
  });

  it('validates duplicate table numbers in NewSlotForm', async () => {
    stubSlotsApi();
    renderSlotsPage();

    await screen.findByText('12:00–13:00');

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '15:00' } });

    // Row 1: table 1, 4 seats
    fireEvent.change(screen.getByLabelText('Seats, row 1'), { target: { value: '4' } });

    // Add row 2: change tableNumber to 1 as well
    fireEvent.click(screen.getByRole('button', { name: 'Add a table' }));
    fireEvent.change(screen.getByLabelText('Table number, row 2'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Seats, row 2'), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: /Create the slot/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Two tables have the same number.');
  });

  it('creates a new slot with table rows and resets the form', async () => {
    const fetchMock = stubSlotsApi({
      postSlotHandler: () =>
        json(
          {
            id: 10,
            date: '2026-11-04',
            startTime: '14:00',
            endTime: '15:00',
            tables: [
              { tableNumber: 1, seats: 4 },
              { tableNumber: 2, seats: 6 },
            ],
            totalSeats: 10,
          },
          201,
        ),
    });

    renderSlotsPage();
    await screen.findByText('12:00–13:00');

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('Seats, row 1'), { target: { value: '4' } });

    // Add table 2
    fireEvent.click(screen.getByRole('button', { name: 'Add a table' }));
    fireEvent.change(screen.getByLabelText('Seats, row 2'), { target: { value: '6' } });

    fireEvent.click(screen.getByRole('button', { name: /Create the slot/ }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Slot created: 14:00–15:00, 10 seats.',
    );

    const postCall = fetchMock.mock.calls.find(([u]) => u === '/api/slots');
    expect(postCall).toBeDefined();
    expect(JSON.parse((postCall?.[1] as RequestInit).body as string)).toEqual({
      date: '2026-11-04',
      startTime: '14:00',
      endTime: '15:00',
      tables: [
        { tableNumber: 1, seats: 4 },
        { tableNumber: 2, seats: 6 },
      ],
    });
  });

  it('allows removing table rows in the table editor', async () => {
    stubSlotsApi();
    renderSlotsPage();
    await screen.findByText('12:00–13:00');

    // Add row 2
    fireEvent.click(screen.getByRole('button', { name: 'Add a table' }));
    expect(screen.getByLabelText('Table number, row 2')).toBeInTheDocument();

    // Remove row 2
    fireEvent.click(screen.getByRole('button', { name: 'Remove row 2' }));
    expect(screen.queryByLabelText('Table number, row 2')).not.toBeInTheDocument();
  });

  it('creates a slot with tables to add later (0 seats)', async () => {
    const fetchMock = stubSlotsApi({
      postSlotHandler: () =>
        json(
          {
            id: 11,
            date: '2026-11-04',
            startTime: '15:00',
            endTime: '16:00',
            tables: [],
            totalSeats: 0,
          },
          201,
        ),
    });

    renderSlotsPage();
    await screen.findByText('12:00–13:00');

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '16:00' } });

    // Switch mode to "Add them later"
    fireEvent.click(screen.getByRole('radio', { name: 'Add them later' }));
    expect(
      screen.getByText(
        'The slot has 0 seats, and hikers cannot book it, until its tables are defined.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Create the slot/ }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Slot created: 15:00–16:00, 0 seats.',
    );

    const postCall = fetchMock.mock.calls.find(([u]) => u === '/api/slots');
    expect(JSON.parse((postCall?.[1] as RequestInit).body as string)).toEqual({
      date: '2026-11-04',
      startTime: '15:00',
      endTime: '16:00',
    });
  });

  it('creates a slot copying tables from an existing slot', async () => {
    const fetchMock = stubSlotsApi({
      postSlotHandler: () =>
        json(
          {
            id: 12,
            date: '2026-11-04',
            startTime: '13:00',
            endTime: '14:00',
            tables: slotWithTables.tables,
            totalSeats: 6,
          },
          201,
        ),
    });

    renderSlotsPage();
    await screen.findByText('12:00–13:00');

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '13:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '14:00' } });

    fireEvent.click(screen.getByRole('radio', { name: 'Copy tables from another slot' }));

    // If submitted without selecting a slot
    fireEvent.click(screen.getByRole('button', { name: /Create the slot/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose the slot to copy the tables from.',
    );

    // Select slot 1 in the dropdown
    const select = await screen.findByLabelText('Copy the tables of');
    fireEvent.change(select, { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: /Create the slot/ }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Slot created: 13:00–14:00, 6 seats.',
    );

    const postCall = fetchMock.mock.calls.find(([u]) => u === '/api/slots');
    expect(JSON.parse((postCall?.[1] as RequestInit).body as string)).toEqual({
      date: '2026-11-04',
      startTime: '13:00',
      endTime: '14:00',
      copyTablesFromSlotId: 1,
    });
  });

  it('opens DefineTablesForm, defines tables, and saves successfully', async () => {
    const fetchMock = stubSlotsApi({
      putTablesHandler: () =>
        json(
          {
            ...emptySlot,
            tables: [{ tableNumber: 1, seats: 1 }],
            totalSeats: 1,
          },
          200,
        ),
    });

    renderSlotsPage();
    await screen.findByText('12:00–13:00');

    // Click "Define tables" for empty slot (19:30-21:00)
    fireEvent.click(screen.getByRole('button', { name: 'Define the tables of 19:30–21:00' }));

    expect(await screen.findByText(/Tables for 19:30–21:00/)).toBeInTheDocument();

    // Validation: submitting with empty seats shows error
    fireEvent.click(screen.getByRole('button', { name: /Save the tables/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Every table needs a number and its seats, both above zero.',
    );

    // Fill seats (1 seat tests singular label)
    fireEvent.change(screen.getByLabelText('Seats, row 1'), { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: /Save the tables/ }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Tables saved for 19:30–21:00, 1 seat.',
    );

    // After done, DefineTablesForm closes and NewSlotForm returns
    expect(screen.getByText(/New slot on/)).toBeInTheDocument();

    const putCall = fetchMock.mock.calls.find(([u]) => u === '/api/slots/2/tables');
    expect(putCall).toBeDefined();
    expect(JSON.parse((putCall?.[1] as RequestInit).body as string)).toEqual({
      tables: [{ tableNumber: 1, seats: 1 }],
    });
  });

  it('allows cancelling DefineTablesForm', async () => {
    stubSlotsApi();
    renderSlotsPage();
    await screen.findByText('12:00–13:00');

    fireEvent.click(screen.getByRole('button', { name: 'Define the tables of 19:30–21:00' }));
    expect(await screen.findByText(/Tables for 19:30–21:00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText(/New slot on/)).toBeInTheDocument();
  });

  it('defines tables by copying from another slot in DefineTablesForm', async () => {
    const fetchMock = stubSlotsApi({
      putTablesHandler: () =>
        json(
          {
            ...emptySlot,
            tables: slotWithTables.tables,
            totalSeats: 6,
          },
          200,
        ),
    });

    renderSlotsPage();
    await screen.findByText('12:00–13:00');

    fireEvent.click(screen.getByRole('button', { name: 'Define the tables of 19:30–21:00' }));
    expect(await screen.findByText(/Tables for 19:30–21:00/)).toBeInTheDocument();

    // Select copy mode in DefineTablesForm
    const copyRadio = screen.getByRole('radio', { name: 'Copy tables from another slot' });
    fireEvent.click(copyRadio);

    // Change copy date
    const copyDateInput = screen.getByLabelText('Day of the slot to copy');
    fireEvent.change(copyDateInput, { target: { value: '2026-11-04' } });

    // Select slot 1
    const select = await screen.findByLabelText('Copy the tables of');
    fireEvent.change(select, { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: /Save the tables/ }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Tables saved for 19:30–21:00, 6 seats.',
    );

    const putCall = fetchMock.mock.calls.find(([u]) => u === '/api/slots/2/tables');
    expect(JSON.parse((putCall?.[1] as RequestInit).body as string)).toEqual({
      copyTablesFromSlotId: 1,
    });
  });

  it('displays API error notice when creating a duplicate slot (409 conflict)', async () => {
    stubSlotsApi({
      postSlotHandler: () =>
        json({ message: 'A slot with the same date, start and end already exists' }, 409),
    });

    renderSlotsPage();
    await screen.findByText('12:00–13:00');

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '13:00' } });
    fireEvent.change(screen.getByLabelText('Seats, row 1'), { target: { value: '4' } });

    fireEvent.click(screen.getByRole('button', { name: /Create the slot/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A slot with the same date, start and end already exists',
    );
  });

  it('displays session expired message when receiving 401 on slot mutation', async () => {
    stubSlotsApi({
      postSlotHandler: () => json({ message: 'Unauthorized' }, 401),
    });

    renderSlotsPage();
    await screen.findByText('12:00–13:00');

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('Seats, row 1'), { target: { value: '4' } });

    fireEvent.click(screen.getByRole('button', { name: /Create the slot/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The session has expired. Please log in again.',
    );
  });

  it('displays conflict message when attempting to modify already defined tables (409)', async () => {
    stubSlotsApi({
      putTablesHandler: () =>
        json({ message: 'This slot already has tables: changing them is MH-19' }, 409),
    });

    renderSlotsPage();
    await screen.findByText('12:00–13:00');

    fireEvent.click(screen.getByRole('button', { name: 'Define the tables of 19:30–21:00' }));
    fireEvent.change(screen.getByLabelText('Seats, row 1'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /Save the tables/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This slot already has tables: changing them is MH-19',
    );
  });
});
