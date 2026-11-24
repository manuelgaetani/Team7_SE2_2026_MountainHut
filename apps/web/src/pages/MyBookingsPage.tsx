import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import type { MyBooking } from '@mountain-hut/shared';
import { useCurrentUser } from '../api/useAuth.ts';
import { useMyBookings } from '../api/useBookings.ts';
import { useMyProfile } from '../api/useProfile.ts';
import { CancelBookingDialog } from '../components/CancelBookingDialog.tsx';
import { MyBookingCard } from '../components/MyBookingCard.tsx';
import './MyBookingsPage.css';
import { apiErrorMessage } from '../lib/errors.ts';
import { ErrorNotice } from '../components/ErrorNotice.tsx';

type Tab = 'upcoming' | 'cancelled';

const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: 'upcoming', label: 'Upcoming', empty: 'You have no upcoming bookings.' },
  { id: 'cancelled', label: 'Cancelled', empty: 'You have no cancelled bookings.' },
];

const inTab = (booking: MyBooking, tab: Tab): boolean =>
  (booking.status === 'CANCELLED') === (tab === 'cancelled');

function MyBookingsList() {
  const bookingsQuery = useMyBookings();
  const [tab, setTab] = useState<Tab>('upcoming');
  // The booking being cancelled. The dialog stays open after the list has been reloaded.
  const [cancelling, setCancelling] = useState<MyBooking | null>(null);

  if (bookingsQuery.isPending) return <p role="status">Loading your bookings…</p>;
  if (bookingsQuery.isError) {
    return (
      <ErrorNotice
        message={apiErrorMessage(
          bookingsQuery.error,
          'Your bookings could not be loaded. Please try again.',
          [403],
        )}
      />
    );
  }

  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  const shown = bookingsQuery.data.filter((b) => inTab(b, tab));

  return (
    <>
      <div role="tablist" aria-label="Bookings" className="my-bookings__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === tab}
            aria-controls="bookings-panel"
            className="my-bookings__tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="bookings-panel" aria-labelledby={`tab-${tab}`}>
        {shown.length === 0 ? (
          <p className="notice notice--ok">
            {current.empty} {tab === 'upcoming' && <Link to="/book">Book a table</Link>}
          </p>
        ) : (
          <div className="my-bookings__list">
            {shown.map((b) => (
              <MyBookingCard key={b.id} booking={b} onCancel={() => setCancelling(b)} />
            ))}
          </div>
        )}
      </div>

      {cancelling && (
        <CancelBookingDialog booking={cancelling} onClose={() => setCancelling(null)} />
      )}
    </>
  );
}

// Name, email and phone of the hiker. Optional details left empty at registration show as
// "Not provided".
function MyProfile({ userId }: { userId: number }) {
  const profileQuery = useMyProfile(userId);

  let details;
  if (profileQuery.isPending) {
    details = <p role="status">Loading your profile…</p>;
  } else if (profileQuery.isError) {
    details = (
      <p role="alert" className="notice notice--error">
        Your profile could not be loaded.
      </p>
    );
  } else {
    const profile = profileQuery.data;
    const fields = [
      { label: 'Full name', value: profile.fullName },
      { label: 'Email', value: profile.email },
      { label: 'Phone', value: profile.phone },
    ];
    details = (
      <dl className="my-profile__card">
        {fields.map((f) => (
          <div key={f.label} className="my-profile__field">
            <dt>{f.label}</dt>
            <dd>{f.value || 'Not provided'}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <aside className="my-profile" aria-labelledby="my-profile-title">
      <h2 id="my-profile-title" className="my-bookings__title">
        My profile
      </h2>
      {details}
    </aside>
  );
}

export function MyBookingsPage() {
  const { data: user, isPending } = useCurrentUser();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'WARDEN';

  // A visitor without a session has no bookings to see: the page for visitors not signed in.
  if (!isPending && !user) return <Navigate to="/unauthorized" replace />;

  let content = null;
  if (!isPending) {
    if (isStaff) {
      content = <p className="notice notice--ok">Staff accounts have no bookings.</p>;
    } else {
      content = <MyBookingsList />;
    }
  }

  return (
    <div className="my-bookings">
      <section className="my-bookings__hero">
        <p className="my-bookings__eyebrow">Your personal area</p>
        <h1 className="my-bookings__headline">Your next seat in the mountains.</h1>
        <p className="my-bookings__lead">Find your bookings and plan your next visit to the hut.</p>
      </section>

      <div
        className={
          user && !isStaff ? 'my-bookings__body my-bookings__body--split' : 'my-bookings__body'
        }
      >
        {user && !isStaff && <MyProfile userId={user.id} />}
        <section>
          <h2 className="my-bookings__title">My bookings</h2>
          {content}
        </section>
      </div>
    </div>
  );
}
