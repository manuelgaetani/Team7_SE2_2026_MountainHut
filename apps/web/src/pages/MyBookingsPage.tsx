import { useState } from 'react';
import { Link } from 'react-router';
import type { MyBooking } from '@mountain-hut/shared';
import { ApiError } from '../api/client.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { useMyBookings } from '../api/useBookings.ts';
import { CancelBookingDialog } from '../components/CancelBookingDialog.tsx';
import { MyBookingCard } from '../components/MyBookingCard.tsx';
import './MyBookingsPage.css';

type Tab = 'upcoming' | 'cancelled';

const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: 'upcoming', label: 'Upcoming', empty: 'You have no upcoming bookings.' },
  { id: 'cancelled', label: 'Cancelled', empty: 'You have no cancelled bookings.' },
];

const inTab = (booking: MyBooking, tab: Tab): boolean =>
  (booking.status === 'CANCELLED') === (tab === 'cancelled');

function loadError(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) {
    return 'The session has expired. Please log in again.';
  }
  if (e instanceof ApiError && e.status === 403) return e.message;
  return 'Your bookings could not be loaded. Please try again.';
}

function MyBookingsList() {
  const bookingsQuery = useMyBookings();
  const [tab, setTab] = useState<Tab>('upcoming');
  // The booking being cancelled. The dialog stays open after the list has been reloaded.
  const [cancelling, setCancelling] = useState<MyBooking | null>(null);

  if (bookingsQuery.isPending) return <p role="status">Loading your bookings…</p>;
  if (bookingsQuery.isError) {
    return (
      <p role="alert" className="notice notice--error">
        {loadError(bookingsQuery.error)}
      </p>
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

export function MyBookingsPage() {
  const { data: user, isPending } = useCurrentUser();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'WARDEN';

  let content = null;
  if (!isPending) {
    if (!user) {
      content = (
        <p className="notice notice--ok">
          <Link to="/login">Log in</Link> to see your bookings.
        </p>
      );
    } else if (isStaff) {
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

      <div className="my-bookings__body">
        <h2 className="my-bookings__title">My bookings</h2>
        {content}
      </div>
    </div>
  );
}
