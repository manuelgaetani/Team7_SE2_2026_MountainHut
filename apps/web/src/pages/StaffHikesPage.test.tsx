import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffHike } from '@mountain-hut/shared';
import { json, renderAt, stubApi, user } from '../test/app.tsx';

const TEXT = {
  title: 'Hikes',
  loading: 'Loading the hikes…',
  staffOnly: 'This page is for the hut staff.',
  underWay: /Under way/,
  planned: /Planned/,
  past: /Past/,
  noneOut: 'No hiker is out right now.',
  nonePlanned: 'No hike is planned.',
  noMatch: 'No hike matches the search.',
  search: 'Search',
  loadFailed: 'The hikes could not be loaded. Please try again.',
  sessionExpired: /The session has expired/,
} as const;

const URL = '/api/staff/hikes';
const employee = { id: 2, email: 'employee@hut.test', role: 'EMPLOYEE' };

const anna = {
  id: 7,
  fullName: 'Anna Bianchi',
  email: 'anna@example.test',
  phone: '+39 333 111 2222',
  emergencyContact: 'Marco Bianchi · +39 333 999 8888',
};
const luca = { id: 9, fullName: 'Luca Verdi', email: null, phone: null, emergencyContact: null };

const hike = (patch: Partial<StaffHike>): StaffHike => ({
  id: 1,
  destination: 'Monte Vettore',
  route: 'From Forca di Presta',
  passagePoints: ['Rifugio Tito Zilioli'],
  departureDate: '2026-11-26',
  departureTime: '07:00',
  returnDate: '2026-11-26',
  returnTime: '17:00',
  predefinedHikeId: null,
  hiker: anna,
  ...patch,
});

// The API order: the latest departure first. "Now" is Thursday 26 November 2026, 10:00.
const later = hike({
  id: 4,
  destination: 'Monte Sibilla',
  departureDate: '2026-12-05',
  returnDate: '2026-12-05',
  hiker: luca,
  passagePoints: [],
});
const soon = hike({
  id: 3,
  destination: 'Lago di Pilato',
  departureDate: '2026-11-28',
  returnDate: '2026-11-28',
});
const out = hike({ id: 2 });
const past = hike({
  id: 1,
  destination: 'Pizzo del Diavolo',
  departureDate: '2026-11-20',
  returnDate: '2026-11-20',
  hiker: luca,
});

const asStaff = (hikes: () => Response, me: unknown = employee) =>
  stubApi({ '/api/auth/me': () => json(me), [URL]: hikes });

const titles = () =>
  screen.getAllByRole('article').map((a) => within(a).getByRole('heading').textContent);
const tab = (name: RegExp) => screen.getByRole('tab', { name });

describe('StaffHikesPage (MH-20)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 26, 10, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks a visitor to sign in with a staff account', async () => {
    const fetchMock = stubApi();
    renderAt('/staff/hikes');
    const notice = await screen.findByText(/to see the hikes\./);
    expect(within(notice).getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Fstaff%2Fhikes',
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(URL);
  });

  it('tells a hiker the page is for the staff, without loading the hikes', async () => {
    const fetchMock = stubApi({ '/api/auth/me': () => json(user) });
    renderAt('/staff/hikes');
    expect(await screen.findByText(TEXT.staffOnly)).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(URL);
  });

  it.each(['EMPLOYEE', 'WARDEN'])('shows the hikers out now to the %s', async (role) => {
    asStaff(() => json([later, soon, out, past]), { ...employee, role });
    renderAt('/staff/hikes');
    expect(await screen.findByRole('heading', { name: 'Monte Vettore' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: TEXT.title })).toBeVisible();
    expect(tab(TEXT.underWay)).toHaveAttribute('aria-selected', 'true');
    expect(titles()).toEqual(['Monte Vettore']);
  });

  it('shows the hiker and their contacts on each hike', async () => {
    asStaff(() => json([out]));
    renderAt('/staff/hikes');
    const card = within(await screen.findByRole('article', { name: 'Monte Vettore' }));
    const hiker = within(card.getByRole('group', { name: 'Hiker' }));
    expect(hiker.getByText('Anna Bianchi')).toBeVisible();
    expect(hiker.getByRole('link', { name: anna.phone })).toHaveAttribute(
      'href',
      `tel:${anna.phone}`,
    );
    expect(hiker.getByRole('link', { name: anna.email })).toHaveAttribute(
      'href',
      `mailto:${anna.email}`,
    );
    expect(hiker.getByText(anna.emergencyContact)).toBeVisible();
    expect(card.getByText('Via Rifugio Tito Zilioli')).toBeVisible();
    expect(card.getByText('Thursday 26 November 2026, 17:00')).toBeVisible();
  });

  it('shows a dash for the contacts a temporary hiker does not have', async () => {
    asStaff(() => json([hike({ hiker: luca })]));
    renderAt('/staff/hikes');
    const card = within(await screen.findByRole('article', { name: 'Monte Vettore' }));
    expect(within(card.getByRole('group', { name: 'Hiker' })).getAllByText('—')).toHaveLength(3);
  });

  it('counts the hikes per tab and lists the planned ones the soonest first', async () => {
    asStaff(() => json([later, soon, out, past]));
    renderAt('/staff/hikes');
    await screen.findByRole('article', { name: 'Monte Vettore' });
    expect(tab(TEXT.underWay)).toHaveTextContent('1');
    expect(tab(TEXT.planned)).toHaveTextContent('2');
    expect(tab(TEXT.past)).toHaveTextContent('1');

    fireEvent.click(tab(TEXT.planned));
    expect(titles()).toEqual(['Lago di Pilato', 'Monte Sibilla']);
    fireEvent.click(tab(TEXT.past));
    expect(titles()).toEqual(['Pizzo del Diavolo']);
  });

  it('searches by hiker, destination and passage point', async () => {
    asStaff(() => json([later, soon, out, past]));
    renderAt('/staff/hikes');
    await screen.findByRole('article', { name: 'Monte Vettore' });
    fireEvent.click(tab(TEXT.planned));

    fireEvent.change(screen.getByLabelText(TEXT.search), { target: { value: 'luca' } });
    expect(titles()).toEqual(['Monte Sibilla']);
    expect(tab(TEXT.underWay)).toHaveTextContent('0');

    fireEvent.change(screen.getByLabelText(TEXT.search), { target: { value: 'PILATO' } });
    expect(titles()).toEqual(['Lago di Pilato']);

    fireEvent.change(screen.getByLabelText(TEXT.search), { target: { value: 'zilioli' } });
    expect(titles()).toEqual(['Lago di Pilato']);

    fireEvent.change(screen.getByLabelText(TEXT.search), { target: { value: 'nowhere' } });
    expect(screen.getByText(TEXT.noMatch)).toBeInTheDocument();
  });

  it('says when no hiker is out and no hike is planned', async () => {
    asStaff(() => json([past]));
    renderAt('/staff/hikes');
    expect(await screen.findByText(TEXT.noneOut)).toBeInTheDocument();
    fireEvent.click(tab(TEXT.planned));
    expect(screen.getByText(TEXT.nonePlanned)).toBeInTheDocument();
  });

  it('shows the loading text while the hikes arrive', async () => {
    asStaff(() => json([]));
    renderAt('/staff/hikes');
    expect(await screen.findByText(TEXT.loading)).toBeInTheDocument();
  });

  it('offers to sign in again when the session has expired', async () => {
    asStaff(() => json({ message: 'Not authenticated' }, 401));
    renderAt('/staff/hikes');
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.sessionExpired);
  });

  it('shows a generic message for an unexpected error', async () => {
    asStaff(() => json({}, 500));
    renderAt('/staff/hikes');
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.loadFailed);
  });
});
