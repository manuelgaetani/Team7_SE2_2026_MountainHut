import { useState } from 'react';
import type { MyBooking, MyBookingStatus } from '@mountain-hut/shared';
import { CHANGE_LEAD_HOURS, isChangeOpen } from '../lib/bookingChange.ts';
import { dateFull, fromIsoDate, monthShort } from '../lib/dates.ts';
import { ModifyBookingDialog } from './ModifyBookingDialog.tsx';

const STATUS_LABEL: Record<MyBookingStatus, string> = {
  CONFIRMED: 'Confirmed',
  PENDING: 'Awaiting confirmation',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const people = (n: number): string => (n === 1 ? '1 person' : `${n} people`);

// Bottom of the card: the party requirements or, for a pending booking, what happens next.
function CardFooter({ booking }: { booking: MyBooking }) {
  if (booking.requirements.length > 0) {
    return (
      <div className="booking-card__note">
        <p className="booking-card__note-title">Dietary requirements</p>
        <ul className="booking-card__requirements">
          {booking.requirements.map((r, i) => (
            <li key={i}>
              {r.allergies && <span className="badge badge--allergies">Allergies</span>}
              {r.description}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (booking.status === 'PENDING') {
    return (
      <p className="booking-card__note">We'll email you as soon as the request is confirmed.</p>
    );
  }
  return null;
}

interface MyBookingCardProps {
  booking: MyBooking;
  // Opens the cancellation dialog, kept by the page: the card leaves the list once cancelled.
  onCancel: () => void;
}

export function MyBookingCard({ booking, onCancel }: MyBookingCardProps) {
  const day = fromIsoDate(booking.date);
  const title = dateFull(day);
  const titleId = `booking-${booking.id}-title`;
  const active = booking.status === 'CONFIRMED' || booking.status === 'PENDING';
  // Within 48 hours of the slot the API refuses every change (MH-06).
  const changeable = active && isChangeOpen(booking.date, booking.startTime);
  const [modifying, setModifying] = useState(false);

  return (
    <article className="booking-card" aria-labelledby={titleId}>
      <div className="booking-card__main">
        <p className="booking-card__date" aria-hidden="true">
          <span className="booking-card__month">{monthShort(day)}</span>
          <span className="booking-card__day">{String(day.getDate()).padStart(2, '0')}</span>
        </p>

        <div className="booking-card__info">
          <div className="booking-card__heading">
            <h3 id={titleId} className="booking-card__title">
              {title}
            </h3>
            <span className={`badge badge--${booking.status.toLowerCase()}`}>
              {STATUS_LABEL[booking.status]}
            </span>
          </div>
          <p className="booking-card__meta">
            {booking.startTime} · {people(booking.partySize)}
          </p>
        </div>

        {active && (
          <div className="booking-card__actions">
            <button
              type="button"
              className="pill"
              aria-label={`Modify booking of ${title}`}
              disabled={!changeable}
              onClick={() => setModifying(true)}
            >
              Modify
            </button>
            <button
              type="button"
              className="pill pill--danger"
              aria-label={`Cancel booking of ${title}`}
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <CardFooter booking={booking} />

      {active && !changeable && (
        <p className="notice booking-card__locked">
          This booking can no longer be changed: changes are admitted up to {CHANGE_LEAD_HOURS}{' '}
          hours before the booked date.
        </p>
      )}

      {modifying && <ModifyBookingDialog booking={booking} onClose={() => setModifying(false)} />}
    </article>
  );
}
