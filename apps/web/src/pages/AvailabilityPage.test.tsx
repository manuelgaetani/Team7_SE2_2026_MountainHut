import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailabilityResult } from '@mountain-hut/shared';
import { authPath, bookingPath } from '../lib/bookingRedirect.ts';
import { json, renderAt, stubApi, user } from '../test/app.tsx';

const TEXT = {
  title: 'Check availability',
  date: 'Date',
  time: 'Time',
  partySize: 'Party size',
  submit: 'Check availability',
  submitting: 'Checking…',
  loading: 'Checking the slot…',
  available: 'Available',
  notAvailable: 'Not available',
  dateError: 'Choose a date.',
  timeError: 'Choose a time.',
  bookTable: 'Book a table',
  registerToBook: 'Register to book a table',
  signIn: 'Sign in',
  badQuery: 'Check the date, the time and the party size.',
  checkFailed: 'The check failed. Please try again.',
} as const;

const availableResult: AvailabilityResult = {
  available: true,
  date: '2026-11-14',
  time: '12:30',
  partySize: 5,
  slot: { startTime: '12:00', endTime: '13:30' },
  totalFreeSeats: 8,
  tables: [
    { tableNumber: 1, seats: 4 },
    { tableNumber: 2, seats: 1 },
  ],
  breakdown: [4, 1],
  breakdownText: '4 + 1',
};

function stubAvailability({
  session = null as unknown,
  handler = (() => json(availableResult)) as (url: string) => Response | Promise<Response>,
} = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/auth/me') return Promise.resolve(session ? json(session) : json({}, 401));
    if (url === '/api/auth/refresh') return Promise.resolve(json({}, 401));
    if (url.startsWith('/api/availability?')) return Promise.resolve(handler(url));
    return Promise.reject(new Error(`Unexpected request ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const availabilityCalls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/availability?'));

const partyValue = () => screen.getByRole('status', { name: TEXT.partySize });

// The stepper starts at 2.
function setParty(target: number) {
  while (Number(partyValue().textContent) < target) {
    fireEvent.click(screen.getByRole('button', { name: 'More guests' }));
  }
  while (Number(partyValue().textContent) > target) {
    fireEvent.click(screen.getByRole('button', { name: 'Fewer guests' }));
  }
}

function fillAndSubmit({
  date,
  time = '12:30',
  partySize,
}: {
  date?: string;
  time?: string;
  partySize?: number;
} = {}) {
  if (date !== undefined)
    fireEvent.change(screen.getByLabelText(TEXT.date), { target: { value: date } });
  fireEvent.change(screen.getByLabelText(TEXT.time), { target: { value: time } });
  if (partySize !== undefined) setParty(partySize);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(TEXT.submit) }));
}

describe('AvailabilityPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 14, 10, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders publicly with today as default date and does not query before submit', () => {
    const fetchMock = stubAvailability();
    renderAt('/availability');

    expect(screen.getByRole('heading', { name: TEXT.title })).toBeVisible();
    expect(screen.getByLabelText(TEXT.date)).toHaveValue('2026-11-14');
    expect(screen.getByLabelText(TEXT.time)).toHaveValue('');
    expect(partyValue()).toHaveTextContent('2');
    expect(screen.getByLabelText(TEXT.date)).toHaveAttribute('min', '2026-11-14');
    expect(availabilityCalls(fetchMock)).toHaveLength(0);
  });

  it('validates date and time client-side without calling the API', () => {
    const fetchMock = stubAvailability();
    renderAt('/availability');

    fillAndSubmit({ date: '', time: '' });
    expect(screen.getByText(TEXT.dateError)).toHaveAttribute('role', 'alert');
    expect(screen.getByText(TEXT.timeError)).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText(TEXT.date)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(TEXT.time)).toHaveAttribute('aria-invalid', 'true');
    expect(availabilityCalls(fetchMock)).toHaveLength(0);
  });

  it('steps the party size from 1 upwards with no upper limit', () => {
    stubAvailability();
    renderAt('/availability');

    fireEvent.click(screen.getByRole('button', { name: 'Fewer guests' }));
    expect(partyValue()).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Fewer guests' })).toBeDisabled();
    setParty(40);
    expect(partyValue()).toHaveTextContent('40');
    expect(screen.getByRole('button', { name: 'More guests' })).toBeEnabled();
  });

  it('shows loading status while checking and disables submit button', async () => {
    let resolveCheck: (r: Response) => void = () => undefined;
    stubAvailability({
      handler: () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    });
    renderAt('/availability');

    fillAndSubmit({ time: '12:30', partySize: 5 });
    expect(screen.getByText(TEXT.loading)).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: new RegExp(TEXT.submitting) })).toBeDisabled();

    resolveCheck(json(availableResult));
    expect(await screen.findByText(TEXT.available)).toBeVisible();
  });

  it('shows layout, tables, and register/sign-in redirect links to anonymous visitors', async () => {
    const fetchMock = stubAvailability();
    renderAt('/availability');

    fillAndSubmit({ time: '12:30', partySize: 5 });

    expect(await screen.findByText(TEXT.available)).toBeVisible();
    expect(availabilityCalls(fetchMock)[0]?.[0]).toBe(
      '/api/availability?date=2026-11-14&time=12%3A30&partySize=5',
    );
    expect(screen.getByText('Sat 14 Nov, slot 12:00–13:30, for 5 people')).toBeVisible();
    expect(screen.getByText('Table layout: 4 + 1')).toBeVisible();

    const list = screen.getByRole('list', { name: 'Tables for the party' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Table 1 · 4 seats', 'Table 2 · 1 seat']);

    const resultCard = screen.getByText(TEXT.available).closest('div')!;
    const expectedBooking = bookingPath({ date: '2026-11-14', time: '12:00', partySize: 5 });
    expect(within(resultCard).getByRole('link', { name: TEXT.registerToBook })).toHaveAttribute(
      'href',
      authPath('/register', expectedBooking),
    );
    expect(within(resultCard).getByRole('link', { name: TEXT.signIn })).toHaveAttribute(
      'href',
      authPath('/login', expectedBooking),
    );
  });

  it('shows direct Book a table link for signed-in users and handles minimal available payload', async () => {
    const minimalResult: AvailabilityResult = {
      available: true,
      date: '2026-11-14',
      time: '12:30',
      partySize: 2,
    };
    stubAvailability({ session: user, handler: () => json(minimalResult) });
    renderAt('/availability');

    fillAndSubmit({ time: '12:30', partySize: 2 });

    expect(await screen.findByText(TEXT.available)).toBeVisible();
    expect(screen.getByText('Sat 14 Nov at 12:30 for 2 people')).toBeVisible();
    expect(screen.queryByText(/Table layout:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Tables for the party' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: TEXT.bookTable })).toHaveAttribute(
      'href',
      bookingPath({ date: '2026-11-14', time: '12:30', partySize: 2 }),
    );
  });

  it.each([
    [
      'NO_SLOT',
      {
        available: false,
        date: '2026-11-14',
        time: '15:00',
        partySize: 2,
        reason: 'NO_SLOT' as const,
      },
      'There is no time slot at 15:00 on Sat 14 Nov. Try another date or time.',
    ],
    [
      'TOO_LATE',
      {
        available: false,
        date: '2026-11-14',
        time: '11:00',
        partySize: 2,
        reason: 'TOO_LATE' as const,
        slot: { startTime: '10:30', endTime: '12:00' },
      },
      'The slot starts in less than 2 hours, so it can no longer be booked online.',
    ],
    [
      'INSUFFICIENT_SEATS (0)',
      {
        available: false,
        date: '2026-11-14',
        time: '12:30',
        partySize: 4,
        reason: 'INSUFFICIENT_SEATS' as const,
        slot: { startTime: '12:00', endTime: '13:30' },
        totalFreeSeats: 0,
      },
      'Insufficient seats: the slot is full.',
    ],
    [
      'INSUFFICIENT_SEATS (1)',
      {
        available: false,
        date: '2026-11-14',
        time: '12:30',
        partySize: 4,
        reason: 'INSUFFICIENT_SEATS' as const,
        slot: { startTime: '12:00', endTime: '13:30' },
        totalFreeSeats: 1,
      },
      'Insufficient seats: the slot has only 1 free seat.',
    ],
  ])('renders unavailable alert for %s', async (_name, payload, expectedText) => {
    stubAvailability({ handler: () => json(payload) });
    renderAt('/availability');

    fillAndSubmit({ time: payload.time, partySize: payload.partySize });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(TEXT.notAvailable);
    expect(alert).toHaveTextContent(expectedText);
  });

  it('clears previous results and errors whenever any field changes', async () => {
    stubAvailability();
    renderAt('/availability');

    fillAndSubmit({ time: '12:30' });
    expect(await screen.findByText(TEXT.available)).toBeVisible();

    fireEvent.change(screen.getByLabelText(TEXT.date), { target: { value: '2026-11-15' } });
    expect(screen.queryByText(TEXT.available)).not.toBeInTheDocument();

    fillAndSubmit({ time: '12:30' });
    expect(await screen.findByText(TEXT.available)).toBeVisible();
    fireEvent.change(screen.getByLabelText(TEXT.time), { target: { value: '13:00' } });
    expect(screen.queryByText(TEXT.available)).not.toBeInTheDocument();

    fillAndSubmit({ time: '13:00' });
    expect(await screen.findByText(TEXT.available)).toBeVisible();
    setParty(3);
    expect(screen.queryByText(TEXT.available)).not.toBeInTheDocument();

    fillAndSubmit({ time: '', partySize: 3 });
    expect(screen.getByText(TEXT.timeError)).toBeVisible();
    fireEvent.change(screen.getByLabelText(TEXT.time), { target: { value: '12:30' } });
    expect(screen.queryByText(TEXT.timeError)).not.toBeInTheDocument();
  });

  it.each([
    [400, TEXT.badQuery],
    [500, TEXT.checkFailed],
  ])('renders error message for API status %i', async (status, expectedMessage) => {
    stubAvailability({ handler: () => json({ message: 'Server detail' }, status) });
    renderAt('/availability');

    fillAndSubmit({ time: '12:30' });
    expect(await screen.findByRole('alert')).toHaveTextContent(expectedMessage);
  });

  it('renders generic error when fetch rejects', async () => {
    stubAvailability({
      handler: () => Promise.reject(new Error('Network offline')),
    });
    renderAt('/availability');

    fillAndSubmit({ time: '12:30' });
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.checkFailed);
  });
});
