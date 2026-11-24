import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  HikerProfile,
  SlotDetails,
  SlotSummary,
  StaffBookingResult,
} from '@mountain-hut/shared';
import { routes } from '../router.tsx';

const TEXT = {
  title: 'New booking',
  existing: 'Existing hiker',
  quick: 'Quick entry',
  full: 'Full profile',
  search: 'Search by name, phone or email',
  submit: 'Create booking',
  time: 'Time *',
  people: 'Number of people *',
  addRequirement: 'Add a requirement',
  addAnotherRequirement: 'Add another requirement',
  emptyRequirement: 'Describe each requirement or remove it.',
  done: 'Booking created',
  selectHiker: 'Select a hiker, or add a new one with Quick entry or Full profile.',
  noSlots: 'No time slots can be booked on this day.',
  staffOnly: 'This page is for the hut staff.',
  sessionExpired: 'The session has expired. Please log in again.',
  invalidEmail: 'Enter a valid email address.',
  footerExisting: 'This booking will be linked to the selected hiker.',
  footerQuick: 'A temporary hiker will be saved with this booking.',
  footerFull: 'A regular hiker profile will be created with this booking.',
  fewSeats: 'Only 3 free seats left in this slot.',
} as const;

const DAY = '2026-11-21';
const SCHEDULE_URL = `/api/slots/schedule?date=${DAY}`;
const BOOK_URL = '/api/staff/bookings';

const employee = { id: 2, email: 'employee@hut.test', role: 'EMPLOYEE' };
const hiker = { id: 1, email: 'hiker@example.test', role: 'HIKER' };

const slot = (id: number, startTime: string, endTime: string, totalSeats = 8): SlotDetails => ({
  id,
  date: DAY,
  startTime,
  endTime,
  tables: totalSeats > 0 ? [{ tableNumber: 1, seats: totalSeats }] : [],
  totalSeats,
});

const lunch = slot(1, '12:30', '14:00');
const dinner = slot(2, '19:00', '21:00');

const luca: HikerProfile = {
  id: 7,
  fullName: 'Luca Rossi',
  email: 'luca.rossi@example.com',
  phone: '+39 333 123 4567',
  notes: 'Registered mountain guide',
  emergencyContact: 'Anna Rossi · +39 333 987 6543',
  temporary: false,
};
const elena: HikerProfile = { ...luca, id: 8, fullName: 'Elena Rossi', notes: null };

const result = (patch: Partial<StaffBookingResult> = {}): StaffBookingResult => ({
  id: 50,
  slotId: 1,
  partySize: 2,
  status: 'CONFIRMED',
  requirements: [],
  tables: [{ tableNumber: 1, assignedSeats: 2 }],
  hiker: luca,
  ...patch,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

interface Options {
  user?: unknown;
  slots?: SlotDetails[];
  hikers?: HikerProfile[];
  // Free seats by slot id, as GET /api/slots gives them; by default it lists no slot.
  free?: Record<number, number>;
  book?: () => Response;
}

const summaries = (slots: SlotDetails[], free: Record<number, number>): SlotSummary[] =>
  slots
    .filter((s) => s.id in free)
    .map(({ id, date, startTime, endTime }) => ({
      id,
      date,
      startTime,
      endTime,
      freeSeats: free[id],
      availability: free[id] > 0 ? 'AVAILABLE' : 'FULL',
    }));

function stubApi({
  user = employee,
  slots = [lunch, dinner],
  hikers = [luca, elena],
  free = {},
  book = () => json(result(), 201),
}: Options = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(user ? json(user) : json({}, 401));
    if (url === '/api/auth/refresh') return Promise.resolve(json({}, 401));
    if (url === SCHEDULE_URL) return Promise.resolve(json(slots));
    if (url === '/api/slots') return Promise.resolve(json(summaries(slots, free)));
    if (url.startsWith('/api/hikers?')) return Promise.resolve(json(hikers));
    if (url === BOOK_URL) return Promise.resolve(book());
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const router = createMemoryRouter(routes, { initialEntries: ['/staff/bookings/new'] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const bookCalls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([url]) => url === BOOK_URL);

function sentBooking(fetchMock: ReturnType<typeof stubApi>): unknown {
  const call = fetchMock.mock.calls.find(([url]) => url === BOOK_URL) as
    [string, RequestInit] | undefined;
  return JSON.parse(call?.[1].body as string);
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function waitForSlots() {
  await screen.findByRole('option', { name: '12:30–14:00' });
}

// Adds a requirement row of the MH-05 editor and fills it.
function addRequirement(n: number, description: string, allergies: boolean) {
  const add = screen.queryByRole('button', { name: TEXT.addRequirement });
  fireEvent.click(add ?? screen.getByRole('button', { name: TEXT.addAnotherRequirement }));
  // Each entry is a group named "Requirement n", with short names for its controls.
  const row = within(screen.getByRole('group', { name: `Requirement ${n}` }));
  fireEvent.change(row.getByRole('textbox', { name: 'Details' }), {
    target: { value: description },
  });
  if (allergies) fireEvent.click(row.getByRole('checkbox', { name: 'Allergies' }));
}

async function selectLuca() {
  type(TEXT.search, 'Rossi');
  fireEvent.click(await screen.findByRole('button', { name: 'Select Luca Rossi' }));
}

describe('StaffBookingPage (MH-07)', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 10, 21, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks anonymous visitors to log in with a staff account', async () => {
    stubApi({ user: null });
    renderPage();

    expect(await screen.findByText(/with a staff account to enter a booking/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('shows a notice to hikers', async () => {
    stubApi({ user: hiker });
    renderPage();

    expect(await screen.findByText(TEXT.staffOnly)).toBeVisible();
    expect(screen.queryByRole('button', { name: TEXT.submit })).not.toBeInTheDocument();
  });

  it('shows the loading state of the slots', async () => {
    stubApi();
    renderPage();

    expect(await screen.findByText('Loading the slots of the day…')).toBeVisible();
  });

  it('tells when no slot can be booked on the day', async () => {
    stubApi({ slots: [] });
    renderPage();

    expect(await screen.findByText(TEXT.noSlots)).toBeVisible();
    expect(screen.getByLabelText(TEXT.time)).toBeDisabled();
  });

  it('does not offer the slots that have already started or have no tables', async () => {
    vi.setSystemTime(new Date(2026, 10, 21, 12, 45, 0));
    stubApi({ slots: [lunch, slot(3, '15:00', '16:00', 0), dinner] });
    renderPage();

    expect(
      await screen.findByRole('option', { name: '12:30–14:00 (already started)' }),
    ).toBeDisabled();
    expect(screen.getByRole('option', { name: '15:00–16:00 (no tables)' })).toBeDisabled();
    expect(screen.getByLabelText(TEXT.time)).toHaveValue('2');
  });

  it('shows the free seats of each slot and does not offer a full one', async () => {
    stubApi({ free: { 1: 0, 2: 6 } });
    renderPage();

    expect(await screen.findByRole('option', { name: '12:30–14:00 (full)' })).toBeDisabled();
    expect(screen.getByRole('option', { name: '19:00–21:00 · 6 free seats' })).toBeEnabled();
    expect(screen.getByLabelText(TEXT.time)).toHaveValue('2');
  });

  it('does not send a party larger than the free seats of the slot', async () => {
    const fetchMock = stubApi({ free: { 1: 3, 2: 8 } });
    renderPage();
    await screen.findByRole('option', { name: '12:30–14:00 · 3 free seats' });
    await selectLuca();

    type(TEXT.people, '4');
    expect(screen.getByText(TEXT.fewSeats)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));

    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.fewSeats);
    expect(bookCalls(fetchMock)).toHaveLength(0);
  });

  it('lists the hikers matching the search and shows the selected profile', async () => {
    stubApi();
    renderPage();
    await waitForSlots();

    await selectLuca();

    expect(screen.getByText('2 matching hikers · Select a profile')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Select Luca Rossi' })).toHaveTextContent('Selected');
    expect(screen.getByText('Notes: Registered mountain guide')).toBeVisible();
    expect(screen.getByText("This booking will be added to Luca's reservations.")).toBeVisible();
    expect(screen.getByText(TEXT.footerExisting)).toBeVisible();
  });

  it('tells when no hiker matches the search', async () => {
    stubApi({ hikers: [] });
    renderPage();
    await waitForSlots();

    type(TEXT.search, 'Rossi');

    expect(await screen.findByText(/No hiker matches “Rossi”/)).toBeVisible();
  });

  it('does not search with less than two characters', async () => {
    const fetchMock = stubApi();
    renderPage();
    await waitForSlots();

    type(TEXT.search, 'R');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(fetchMock.mock.calls.some(([url]) => url.startsWith('/api/hikers'))).toBe(false);
  });

  it('asks to select a hiker before sending', async () => {
    const fetchMock = stubApi();
    renderPage();
    await waitForSlots();

    fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));

    expect(await screen.findByText(TEXT.selectHiker)).toBeVisible();
    expect(bookCalls(fetchMock)).toHaveLength(0);
  });

  it('books for an existing hiker', async () => {
    const fetchMock = stubApi();
    renderPage();
    await waitForSlots();

    await selectLuca();
    type(TEXT.people, '4');
    addRequirement(1, '1 vegan, peanut allergy', true);
    addRequirement(2, '1 shellfish allergy', true);
    addRequirement(3, '2 vegetarians', false);

    const recap = screen.getByRole('list', { name: 'Requirements of the party' });
    expect(within(recap).getAllByText('Allergies')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));

    const dialog = await screen.findByRole('dialog', { name: TEXT.done });
    expect(within(dialog).getByText('Saturday 21 November · 12:30 · 4 people')).toBeVisible();
    expect(sentBooking(fetchMock)).toEqual({
      slotId: 1,
      partySize: 4,
      requirements: [
        { allergies: true, description: '1 vegan, peanut allergy' },
        { allergies: true, description: '1 shellfish allergy' },
        { allergies: false, description: '2 vegetarians' },
      ],
      hiker: { kind: 'EXISTING', hikerId: 7 },
    });
  });

  it('asks to describe each requirement before sending', async () => {
    const fetchMock = stubApi();
    renderPage();
    await waitForSlots();

    await selectLuca();
    addRequirement(1, '2 vegetarians', false);
    fireEvent.click(screen.getByRole('button', { name: TEXT.addAnotherRequirement }));
    fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));

    expect(await screen.findByText(TEXT.emptyRequirement)).toBeVisible();
    expect(bookCalls(fetchMock)).toHaveLength(0);
  });

  it('books for a temporary hiker with only the name', async () => {
    const fetchMock = stubApi({
      book: () => json(result({ hiker: { ...luca, temporary: true } })),
    });
    renderPage();
    await waitForSlots();

    fireEvent.click(screen.getByRole('button', { name: TEXT.quick }));
    expect(screen.getByText(TEXT.footerQuick)).toBeVisible();
    type('Full name *', 'Luca Bianchi');
    fireEvent.change(screen.getByLabelText(TEXT.time), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));

    await screen.findByRole('dialog', { name: TEXT.done });
    expect(sentBooking(fetchMock)).toEqual({
      slotId: 2,
      partySize: 2,
      hiker: { kind: 'TEMPORARY', fullName: 'Luca Bianchi' },
    });
  });

  it('checks the fields of a full profile before sending', async () => {
    const fetchMock = stubApi();
    renderPage();
    await waitForSlots();

    fireEvent.click(screen.getByRole('button', { name: TEXT.full }));
    type('Full name *', 'Luca Bianchi');
    type('Email *', 'luca');
    type('Mobile number *', '+39 333 456 7890');
    fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));

    expect(await screen.findByText(TEXT.invalidEmail)).toBeVisible();
    expect(screen.getByLabelText('Email *')).toHaveAttribute('aria-invalid', 'true');
    expect(bookCalls(fetchMock)).toHaveLength(0);
  });

  it('creates a regular hiker and shows the generated password', async () => {
    const fetchMock = stubApi({
      book: () => json(result({ generatedPassword: 'k7mq-x3tz-9pwa' })),
    });
    renderPage();
    await waitForSlots();

    fireEvent.click(screen.getByRole('button', { name: TEXT.full }));
    expect(screen.getByText(TEXT.footerFull)).toBeVisible();
    type('Full name *', 'Luca Bianchi');
    type('Email *', 'luca.bianchi@example.com');
    type('Mobile number *', '+39 333 456 7890');
    type('Notes (optional)', 'Registered mountain guide');
    fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));

    const dialog = await screen.findByRole('dialog', { name: TEXT.done });
    expect(within(dialog).getByText('k7mq-x3tz-9pwa')).toBeVisible();
    expect(sentBooking(fetchMock)).toEqual({
      slotId: 1,
      partySize: 2,
      hiker: {
        kind: 'ACCOUNT',
        fullName: 'Luca Bianchi',
        email: 'luca.bianchi@example.com',
        phone: '+39 333 456 7890',
        notes: 'Registered mountain guide',
      },
    });
  });

  it('empties the form when the dialog is closed', async () => {
    stubApi();
    renderPage();
    await waitForSlots();

    await selectLuca();
    fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByLabelText(TEXT.search)).toHaveValue('');
  });

  it('shows the explanation of the API on a conflict', async () => {
    stubApi({ book: () => json({ message: 'Insufficient seats available for this slot' }, 409) });
    renderPage();
    await waitForSlots();

    await selectLuca();
    fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Something to fix' });
    expect(dialog).toHaveTextContent('Insufficient seats available for this slot');

    // Closing the dialog keeps the form as it was, to fix it and send it again.
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText(TEXT.search)).toHaveValue('Rossi');
  });

  it('explains in a dialog that the email of a new profile is already registered', async () => {
    stubApi({ book: () => json({ message: 'Email already registered' }, 409) });
    renderPage();
    await waitForSlots();

    fireEvent.click(screen.getByRole('button', { name: TEXT.full }));
    type('Full name *', 'Alex Brr');
    type('Email *', 'alex@example.com');
    type('Mobile number *', '+39 333 111 2222');
    fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Email already registered');
  });

  it('tells when the session has expired', async () => {
    stubApi({ book: () => json({ message: 'Not authenticated' }, 401) });
    renderPage();
    await waitForSlots();

    await selectLuca();
    fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));

    expect(await screen.findByText(TEXT.sessionExpired)).toBeVisible();
  });
});
