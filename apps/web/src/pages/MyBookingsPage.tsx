import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import type { MyBooking } from '@mountain-hut/shared';
import { useCurrentUser } from '../api/useAuth.ts';
import { useMyBookings, useSendCancellation } from '../api/useBookings.ts';
import { CancelBookingDialog } from '../components/CancelBookingDialog.tsx';
import { MyBookingCard } from '../components/MyBookingCard.tsx';
import { useToast } from '../components/Toast.tsx';
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
  // Cancelled on screen, but still undoable: the request leaves when the toast goes away.
  const [pendingCancel, setPendingCancel] = useState<ReadonlySet<number>>(new Set());
  const sendCancellation = useSendCancellation();
  const toast = useToast();

  const setPending = (id: number, pending: boolean) =>
    setPendingCancel((ids) => {
      const next = new Set(ids);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });

  function confirmCancel(booking: MyBooking) {
    setCancelling(null);
    setPending(booking.id, true);
    toast.show({
      message: 'Booking cancelled. Seats are free again.',
      action: {
        label: 'Undo',
        onClick: () => {
          setPending(booking.id, false);
          toast.show({ message: 'Cancellation undone: your booking is still active.' });
        },
      },
      onExpire: () => {
        sendCancellation(booking.id)
          .catch((err: unknown) =>
            toast.show({
              kind: 'error',
              message: apiErrorMessage(
                err,
                'The booking could not be cancelled. Please try again.',
                [403, 404, 409],
              ),
            }),
          )
          .finally(() => setPending(booking.id, false));
      },
    });
  }

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
  const shown = bookingsQuery.data.filter((b) => inTab(b, tab) && !pendingCancel.has(b.id));

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
        <CancelBookingDialog
          booking={cancelling}
          onClose={() => setCancelling(null)}
          onConfirm={() => confirmCancel(cancelling)}
        />
      )}
    </>
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
      <div className="my-bookings__body">
        <section>
          <h1 className="my-bookings__title">My bookings</h1>
          {content}
        </section>
      </div>
    </div>
  );
}
