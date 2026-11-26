import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { StaffHike } from '@mountain-hut/shared';
import { isStaff } from '../api/roles.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { useStaffHikes } from '../api/useHikes.ts';
import { ErrorNotice } from '../components/ErrorNotice.tsx';
import { HikeCard } from '../components/HikeCard.tsx';
import { apiErrorMessage } from '../lib/errors.ts';
import { hikeState, nowMoment, type HikeState } from '../lib/hikeState.ts';
import './MyBookingsPage.css';
import './StaffBookingPage.css';
import './StaffHikesPage.css';

const TABS: { id: HikeState; label: string; empty: string }[] = [
  { id: 'UNDER_WAY', label: 'Under way', empty: 'No hiker is out right now.' },
  { id: 'PLANNED', label: 'Planned', empty: 'No hike is planned.' },
  { id: 'PAST', label: 'Past', empty: 'No past hikes.' },
];

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
  const [tab, setTab] = useState<HikeState>('UNDER_WAY');
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

  const now = nowMoment(new Date());
  const all = hikesQuery.data
    .filter((hike) => matches(hike, query))
    .map((hike) => ({ hike, state: hikeState(hike, now) }));
  const count = (state: HikeState) => all.filter((h) => h.state === state).length;
  // The API gives the latest departure first: hikes still to come read better the soonest first.
  const inTab = all.filter((h) => h.state === tab);
  const shown = tab === 'PAST' ? inTab : [...inTab].reverse();
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

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
            {t.label} <span className="staff-hikes__count">{count(t.id)}</span>
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
              <HikeCard key={hike.id} hike={hike} state={state} hiker={hike.hiker} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// MH-20: the hut staff see the hikes registered by the hikers, with whom to call.
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
            The hikes registered by the hikers: who is out, where, and when they are expected back.
          </p>
        </div>
      </header>
      <div className="staff-page__body staff-hikes">{content}</div>
    </div>
  );
}
