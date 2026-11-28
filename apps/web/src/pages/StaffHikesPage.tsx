import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { hikeMoment, type StaffHike } from '@mountain-hut/shared';
import { isStaff } from '../api/roles.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { useStaffHikes } from '../api/useHikes.ts';
import { ErrorNotice } from '../components/ErrorNotice.tsx';
import { HikeCard } from '../components/HikeCard.tsx';
import { apiErrorMessage } from '../lib/errors.ts';
import { useNow } from '../lib/useNow.ts';
import { hikeState, nowMoment, type HikeState } from '../lib/hikeState.ts';
import './MyBookingsPage.css';
import './StaffBookingPage.css';
import './StaffHikesPage.css';

type StaffTab = 'ACTIVE' | 'PLANNED' | 'PAST';

// MH-21: the active hikes are the ones under way and the ones started without a check-in.
const TABS: { id: StaffTab; label: string; empty: string; states: HikeState[] }[] = [
  {
    id: 'ACTIVE',
    label: 'Active',
    empty: 'No hiker is out right now.',
    states: ['NO_CHECK_IN', 'UNDER_WAY'],
  },
  { id: 'PLANNED', label: 'Planned', empty: 'No hike is planned.', states: ['PLANNED'] },
  { id: 'PAST', label: 'Past', empty: 'No past hikes.', states: ['PAST'] },
];

type Row = { hike: StaffHike; state: HikeState };

// Active: the hikes without a check-in first (the staff may have to call), then the soonest
// expected return. Planned: the soonest departure. Past: the API order, the latest first.
function order(tab: StaffTab, rows: Row[]): Row[] {
  if (tab === 'PAST') return rows;
  if (tab === 'PLANNED') return [...rows].reverse();
  const returnOf = (r: Row) => hikeMoment(r.hike.returnDate, r.hike.returnTime);
  return [...rows].sort(
    (a, b) =>
      Number(b.state === 'NO_CHECK_IN') - Number(a.state === 'NO_CHECK_IN') ||
      returnOf(a).localeCompare(returnOf(b)),
  );
}

// The search matches the hiker, the destination, the route and the passage points.
function matches(hike: StaffHike, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return [hike.hiker.fullName, hike.destination, hike.route, ...hike.passagePoints].some((text) =>
    text.toLowerCase().includes(q),
  );
}

function StaffHikesList() {
  const hikesQuery = useStaffHikes();
  const now = nowMoment(useNow());
  const [tab, setTab] = useState<StaffTab>('ACTIVE');
  const [query, setQuery] = useState('');

  if (hikesQuery.isPending) return <p role="status">Loading the hikes…</p>;
  if (hikesQuery.isError) {
    return (
      <ErrorNotice
        message={apiErrorMessage(
          hikesQuery.error,
          'The hikes could not be loaded. Please try again.',
          [403],
        )}
      />
    );
  }

  const all = hikesQuery.data
    .filter((hike) => matches(hike, query))
    .map((hike): Row => ({ hike, state: hikeState(hike, now) }));
  const inTab = (t: (typeof TABS)[number]) => all.filter((h) => t.states.includes(h.state));
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  const shown = order(current.id, inTab(current));

  return (
    <>
      <div className="field staff-hikes__search">
        <label htmlFor="staff-hikes-search">Search</label>
        <input
          id="staff-hikes-search"
          type="search"
          placeholder="Hiker, destination or place"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div role="tablist" aria-label="Hikes" className="my-bookings__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`staff-hikes-tab-${t.id}`}
            aria-selected={t.id === tab}
            aria-controls="staff-hikes-panel"
            className="my-bookings__tab"
            onClick={() => setTab(t.id)}
          >
            {t.label} <span className="staff-hikes__count">{inTab(t).length}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id="staff-hikes-panel" aria-labelledby={`staff-hikes-tab-${tab}`}>
        {shown.length === 0 ? (
          <p className="notice notice--ok">
            {query.trim() === '' ? current.empty : 'No hike matches the search.'}
          </p>
        ) : (
          <div className="my-bookings__list">
            {shown.map(({ hike, state }) => (
              <HikeCard key={hike.id} hike={hike} state={state} hiker={hike.hiker} canCheckIn />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// MH-20: the hut staff see the hikes registered by the hikers, with whom to call.
// MH-21: the active hikes first, with the check-in of the hikes started without one.
export function StaffHikesPage() {
  const { data: user, isPending } = useCurrentUser();

  let content: ReactNode;
  if (isPending) {
    content = <p role="status">Loading…</p>;
  } else if (!user) {
    content = (
      <p className="notice notice--ok">
        <Link to="/login?next=%2Fstaff%2Fhikes">Sign in</Link> with a staff account to see the
        hikes.
      </p>
    );
  } else if (!isStaff(user)) {
    content = <p className="notice notice--ok">This page is for the hut staff.</p>;
  } else {
    content = <StaffHikesList />;
  }

  return (
    <div className="staff-page">
      <header className="staff-hero">
        <div className="staff-hero__inner">
          <p className="staff-hero__breadcrumb">Staff area / Hikes</p>
          <h1 className="staff-hero__title">Hikes</h1>
          <p className="staff-hero__subtitle">
            Who is out now, where, and when they are expected back. Check in a hiker who left
            without doing it.
          </p>
        </div>
      </header>
      <div className="staff-page__body staff-hikes">{content}</div>
    </div>
  );
}
