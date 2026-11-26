import type { HikeHiker, RegisteredHike } from '@mountain-hut/shared';
import { dateFull, fromIsoDate, monthShort } from '../lib/dates.ts';
import { HIKE_STATE_LABEL, type HikeState } from '../lib/hikeState.ts';
import '../pages/MyBookingsPage.css';
import './HikeCard.css';

interface HikeCardProps {
  hike: RegisteredHike;
  state: HikeState;
  /** The hiker, shown to the staff; the hiker's own list leaves it out. */
  hiker?: HikeHiker;
}

const moment = (date: string, time: string): string => `${dateFull(fromIsoDate(date))}, ${time}`;

// MH-20: one registered hike, as a card like the bookings of the personal area.
export function HikeCard({ hike, state, hiker }: HikeCardProps) {
  const day = fromIsoDate(hike.departureDate);
  const titleId = `hike-${hike.id}-title`;

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
              {hike.destination}
            </h3>
            <span className={`badge hike-badge--${state.toLowerCase()}`}>
              {HIKE_STATE_LABEL[state]}
            </span>
          </div>
          <p className="booking-card__meta">{hike.route}</p>
          {hike.passagePoints.length > 0 && (
            <p className="hike-card__points">Via {hike.passagePoints.join(' → ')}</p>
          )}
        </div>
      </div>
      <dl className="hike-card__times">
        <div>
          <dt>Departure</dt>
          <dd>{moment(hike.departureDate, hike.departureTime)}</dd>
        </div>
        <div>
          <dt>Expected return</dt>
          <dd>{moment(hike.returnDate, hike.returnTime)}</dd>
        </div>
      </dl>
      {hiker && (
        <dl className="hike-card__hiker" role="group" aria-label="Hiker">
          <div>
            <dt>Hiker</dt>
            <dd>{hiker.fullName}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{hiker.phone ? <a href={`tel:${hiker.phone}`}>{hiker.phone}</a> : '—'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{hiker.email ? <a href={`mailto:${hiker.email}`}>{hiker.email}</a> : '—'}</dd>
          </div>
          <div>
            <dt>Emergency contact</dt>
            <dd>{hiker.emergencyContact ?? '—'}</dd>
          </div>
        </dl>
      )}
    </article>
  );
}
