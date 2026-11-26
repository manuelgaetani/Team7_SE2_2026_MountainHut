import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { isStaff } from '../api/roles.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { useMyHikes } from '../api/useHikes.ts';
import { ErrorNotice } from '../components/ErrorNotice.tsx';
import { HikeCard } from '../components/HikeCard.tsx';
import { hikeState, nowMoment } from '../lib/hikeState.ts';
import { apiErrorMessage } from '../lib/errors.ts';
import './MyBookingsPage.css';
import './MyHikesPage.css';

type Tab = 'upcoming' | 'past';

const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: 'upcoming', label: 'Upcoming', empty: 'You have no upcoming hikes.' },
  { id: 'past', label: 'Past', empty: 'You have no past hikes.' },
];

function MyHikesList() {
  const hikesQuery = useMyHikes();
  const [tab, setTab] = useState<Tab>('upcoming');

  if (hikesQuery.isPending) return <p role="status">Loading your hikes…</p>;
  if (hikesQuery.isError) {
    return (
      <ErrorNotice
        message={apiErrorMessage(
          hikesQuery.error,
          'Your hikes could not be loaded. Please try again.',
          [403],
        )}
      />
    );
  }

  const now = nowMoment(new Date());
  const withState = hikesQuery.data.map((hike) => ({ hike, state: hikeState(hike, now) }));
  // The API gives the latest departure first: upcoming hikes read better the soonest first.
  const shown =
    tab === 'past'
      ? withState.filter((h) => h.state === 'PAST')
      : withState.filter((h) => h.state !== 'PAST').reverse();
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <>
      <div role="tablist" aria-label="Hikes" className="my-bookings__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`hikes-tab-${t.id}`}
            aria-selected={t.id === tab}
            aria-controls="hikes-panel"
            className="my-bookings__tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="hikes-panel" aria-labelledby={`hikes-tab-${tab}`}>
        {shown.length === 0 ? (
          <p className="notice notice--ok">
            {current.empty} {tab === 'upcoming' && <Link to="/hikes/new">Register a hike</Link>}
          </p>
        ) : (
          <div className="my-bookings__list">
            {shown.map(({ hike, state }) => (
              <HikeCard key={hike.id} hike={hike} state={state} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// MH-20: the hikes the hiker has registered, in the personal area.
export function MyHikesPage() {
  const { data: user, isPending } = useCurrentUser();

  // A visitor without a session has no hikes to see: the page for visitors not signed in.
  if (!isPending && !user) return <Navigate to="/unauthorized" replace />;

  let content = null;
  if (!isPending) {
    content = isStaff(user) ? (
      <p className="notice notice--ok">Staff accounts have no hikes.</p>
    ) : (
      <MyHikesList />
    );
  }

  return (
    <div className="my-bookings">
      <div className="my-bookings__body">
        <section>
          <div className="my-hikes__head">
            <h1 className="my-bookings__title">My hikes</h1>
            {user && !isStaff(user) && (
              <Link to="/hikes/new" className="pill pill--outline my-hikes__new">
                Register a hike
              </Link>
            )}
          </div>
          {content}
        </section>
      </div>
    </div>
  );
}
