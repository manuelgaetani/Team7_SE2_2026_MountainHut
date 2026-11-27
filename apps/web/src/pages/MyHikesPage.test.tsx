import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegisteredHike } from '@mountain-hut/shared';
import { json, renderAt, stubApi, user } from '../test/app.tsx';

const TEXT = {
  title: 'My hikes',
  loading: 'Loading your hikes…',
  staff: 'Staff accounts have no hikes.',
  upcoming: 'Upcoming',
  past: 'Past',
  noUpcoming: /You have no upcoming hikes\./,
  noPast: 'You have no past hikes.',
  register: 'Register a hike',
  loadFailed: 'Your hikes could not be loaded. Please try again.',
  sessionExpired: /The session has expired/,
  noProfile: 'A hiker profile is required to see your hikes',
  planned: 'Planned',
  underWay: 'Under way',
} as const;

const MINE_URL = '/api/hikes/mine';

const hike = (patch: Partial<RegisteredHike>): RegisteredHike => ({
  id: 1,
  destination: 'Monte Vettore',
  route: 'From Forca di Presta via Rifugio Zilioli',
  passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
  departureDate: '2026-11-28',
  departureTime: '08:00',
  returnDate: '2026-11-28',
  returnTime: '17:00',
  predefinedHikeId: 2,
  ...patch,
});

// The API order: the latest departure first.
const later = hike({
  id: 3,
  destination: 'Monte Sibilla',
  departureDate: '2026-12-05',
  returnDate: '2026-12-06',
  passagePoints: [],
});
const soon = hike({ id: 2 });
const underWay = hike({
  id: 4,
  destination: 'Lago di Pilato',
  departureDate: '2026-11-26',
  departureTime: '07:00',
  returnDate: '2026-11-26',
  returnTime: '18:00',
  checkedInAt: '2026-11-26T06:55:00.000Z',
});
const past = hike({
  id: 1,
  destination: 'Pizzo del Diavolo',
  departureDate: '2026-11-20',
  returnDate: '2026-11-20',
});

const asHiker = (mine: () => Response) =>
  stubApi({ '/api/auth/me': () => json(user), [MINE_URL]: mine });

const card = (name: string) => screen.getByRole('article', { name });
const titles = () =>
  screen.getAllByRole('article').map((a) => within(a).getByRole('heading').textContent);

describe('MyHikesPage (MH-20)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Thursday 26 November 2026, 10:00 local time.
    vi.setSystemTime(new Date(2026, 10, 26, 10, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends a visitor without a session to the unauthorized page', async () => {
    stubApi();
    const router = renderAt('/hikes');
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/unauthorized'));
  });

  it('tells a staff account it has no hikes, without asking for them', async () => {
    const fetchMock = stubApi({ '/api/auth/me': () => json({ ...user, role: 'EMPLOYEE' }) });
    renderAt('/hikes');
    expect(await screen.findByText(TEXT.staff)).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(MINE_URL);
    expect(screen.queryByRole('link', { name: TEXT.register })).not.toBeInTheDocument();
  });

  it('shows the loading text while the hikes arrive', async () => {
    stubApi({ '/api/auth/me': () => json(user), [MINE_URL]: () => json([]) });
    renderAt('/hikes');
    expect(await screen.findByText(TEXT.loading)).toBeInTheDocument();
  });

  it('lists the upcoming and under way hikes, the soonest first, with their details', async () => {
    asHiker(() => json([later, soon, underWay, past]));
    renderAt('/hikes');

    await screen.findByRole('article', { name: 'Monte Vettore' });
    expect(titles()).toEqual(['Lago di Pilato', 'Monte Vettore', 'Monte Sibilla']);
    expect(screen.getByRole('tab', { name: TEXT.upcoming })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const vettore = within(card('Monte Vettore'));
    expect(vettore.getByText(TEXT.planned)).toBeVisible();
    expect(vettore.getByText('From Forca di Presta via Rifugio Zilioli')).toBeVisible();
    expect(vettore.getByText('Via Forca di Presta → Rifugio Tito Zilioli')).toBeVisible();
    expect(vettore.getByText('Saturday 28 November 2026, 08:00')).toBeVisible();
    expect(vettore.getByText('Saturday 28 November 2026, 17:00')).toBeVisible();
    expect(within(card('Lago di Pilato')).getByText(TEXT.underWay)).toBeVisible();
    expect(within(card('Monte Sibilla')).queryByText(/^Via /)).not.toBeInTheDocument();
  });

  it('moves the hikes whose expected return has come to Past', async () => {
    asHiker(() => json([later, soon, underWay, past]));
    renderAt('/hikes');
    fireEvent.click(await screen.findByRole('tab', { name: TEXT.past }));
    expect(titles()).toEqual(['Pizzo del Diavolo']);
    expect(within(card('Pizzo del Diavolo')).getByText('Past')).toBeVisible();
  });

  it('counts a hike as past exactly at its expected return', async () => {
    vi.setSystemTime(new Date(2026, 10, 26, 18, 0));
    asHiker(() => json([underWay]));
    renderAt('/hikes');
    expect(await screen.findByText(TEXT.noUpcoming)).toBeInTheDocument();
  });

  it('invites to register a hike when there is none', async () => {
    asHiker(() => json([]));
    renderAt('/hikes');
    const notice = await screen.findByText(TEXT.noUpcoming);
    expect(within(notice).getByRole('link', { name: TEXT.register })).toHaveAttribute(
      'href',
      '/hikes/new',
    );
    fireEvent.click(screen.getByRole('tab', { name: TEXT.past }));
    expect(screen.getByText(TEXT.noPast)).toBeInTheDocument();
  });

  it('has a link to register a new hike next to the title', async () => {
    asHiker(() => json([soon]));
    renderAt('/hikes');
    await screen.findByRole('article', { name: 'Monte Vettore' });
    expect(
      screen
        .getAllByRole('link', { name: TEXT.register })
        .some((l) => l.classList.contains('my-hikes__new')),
    ).toBe(true);
  });

  it('explains a missing hiker profile (403)', async () => {
    asHiker(() => json({ message: TEXT.noProfile }, 403));
    renderAt('/hikes');
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.noProfile);
  });

  it('offers to sign in again when the session has expired', async () => {
    asHiker(() => json({ message: 'Not authenticated' }, 401));
    renderAt('/hikes');
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.sessionExpired);
  });

  it('shows a generic message for an unexpected error', async () => {
    asHiker(() => json({}, 500));
    renderAt('/hikes');
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.loadFailed);
  });
});
