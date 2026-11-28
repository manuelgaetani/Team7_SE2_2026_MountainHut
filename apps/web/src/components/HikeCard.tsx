import type { HikeHiker, RegisteredHike } from '@mountain-hut/shared';
import { useCheckInHike } from '../api/useHikes.ts';
import { dateFull, fromIsoDate, monthShort } from '../lib/dates.ts';
import { apiErrorMessage } from '../lib/errors.ts';
import { HIKE_STATE_LABEL, type HikeState } from '../lib/hikeState.ts';
import '../pages/MyBookingsPage.css';
import { useToast } from './Toast.tsx';
import './HikeCard.css';

interface HikeCardProps {
  hike: RegisteredHike;
  state: HikeState;
  /** The hiker, shown to the staff; the hiker's own list leaves it out. */
  hiker?: HikeHiker;
  /** MH-21: offer the check-in while the hike has started without one. */
  canCheckIn?: boolean;
}

// MH-21: the check-in of one hike, with its own request: clicks on different cards do not share
// the pending state, and each gets its toast.
function CheckInButton({ hike }: { hike: RegisteredHike }) {
  const checkIn = useCheckInHike();
  const toast = useToast();
  const onClick = () =>
    checkIn.mutate(hike.id, {
      onSuccess: () => toast.show({ message: `Check-in recorded: ${hike.destination}.` }),
      onError: (e) =>
        toast.show({
          kind: 'error',
          // No 404 passthrough: until the endpoint exists, the framework's text would show.
          message: apiErrorMessage(
            e,
            'The check-in could not be recorded. Please try again.',
            [403, 409],
          ),
        }),
    });
  return (
    <div className="hike-card__actions">
      <button
        type="button"
        className="pill pill--solid"
        onClick={onClick}
        disabled={checkIn.isPending}
      >
        {checkIn.isPending ? 'Checking in…' : 'Check in'}
      </button>
    </div>
  );
}

const clockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const moment = (date: string, time: string): string => `${dateFull(fromIsoDate(date))}, ${time}`;

// MH-20: one registered hike, as a card like the bookings of the personal area.
export function HikeCard({ hike, state, hiker, canCheckIn = false }: HikeCardProps) {
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
        {hike.checkedInAt && (
          <div>
            <dt>Checked in</dt>
            <dd>{clockTime(hike.checkedInAt)}</dd>
          </div>
        )}
      </dl>
      {state === 'NO_CHECK_IN' && canCheckIn && <CheckInButton hike={hike} />}
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
