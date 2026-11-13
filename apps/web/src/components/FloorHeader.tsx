import type { FloorPlan } from '@mountain-hut/shared';
import { Link, useLocation } from 'react-router';
import { dateLong, fromIsoDate, isIsoDate } from '../lib/dates.ts';

// Back to the schedule of the day the staff came from (sent by the "Floor plan" link).
// Without it, for instance when the URL is typed, the schedule opens on today.
function BackLink() {
  const { state } = useLocation() as { state: { date?: unknown } | null };
  const date = state?.date;
  const to = isIsoDate(date) ? `/staff/slots?date=${date}` : '/staff/slots';
  return (
    <Link to={to} className="pill floor-header__back">
      Back to the time slots
    </Link>
  );
}

// The card at the top of the floor plan: the day and the time of the slot, and the way back.
// Without a slot (not loaded yet, or not visible to the user) it shows the title only.
export function FloorHeader({ slot }: { slot?: FloorPlan['slot'] }) {
  return (
    <header className="floor-header">
      <div className="floor-header__card">
        <div>
          <h2 className="floor-header__eyebrow">Floor plan</h2>
          {slot && (
            <>
              <p className="floor-header__date">{dateLong(fromIsoDate(slot.date))}</p>
              <p className="floor-header__time">
                {slot.startTime}–{slot.endTime}
              </p>
              <p className="floor-header__hint">Select a group to see where its people sit.</p>
            </>
          )}
        </div>
        <BackLink />
      </div>
    </header>
  );
}
