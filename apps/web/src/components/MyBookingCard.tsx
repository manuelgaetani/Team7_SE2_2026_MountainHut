import type { MyBooking, MyBookingStatus } from '@mountain-hut/shared';
import { dateLong, fromIsoDate, monthShort } from '../lib/dates.ts';

const STATUS_LABEL: Record<MyBookingStatus, string> = {
  CONFIRMED: 'Confirmed',
  PENDING: 'Awaiting confirmation',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const people = (n: number): string => (n === 1 ? '1 person' : `${n} people`);

// The line at the bottom of the card: the party requirements, or what happens next.
function note(booking: MyBooking): string | null {
  if (booking.requirements) return `Requirements: ${booking.requirements}`;
  if (booking.status === 'PENDING') {
    return "We'll email you as soon as the request is confirmed.";
  }
  return null;
}

export function MyBookingCard({ booking }: { booking: MyBooking }) {
  const day = fromIsoDate(booking.date);
  const title = dateLong(day);
  const titleId = `booking-${booking.id}-title`;
  const active = booking.status === 'CONFIRMED' || booking.status === 'PENDING';
  const footer = note(booking);

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

        {/* TODO(MH-06, MH-08): the actions are wired in the next steps of the stories. */}
        {active && (
          <div className="booking-card__actions">
            <button type="button" className="pill" aria-label={`Modify booking of ${title}`}>
              Modify
            </button>
            <button
              type="button"
              className="pill pill--danger"
              aria-label={`Cancel booking of ${title}`}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {footer && <p className="booking-card__note">{footer}</p>}
    </article>
  );
}
