import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useCurrentUser } from '../api/useAuth.ts';
import { useFloorPlan } from '../api/useSlots.ts';
import { FloorGroups } from '../components/FloorGroups.tsx';
import { FloorSummary } from '../components/FloorSummary.tsx';
import { FloorTables } from '../components/FloorTables.tsx';
import { dateShort, fromIsoDate, isIsoDate } from '../lib/dates.ts';
import { floorErrorMessage, seatsTakenLabel } from '../lib/floorLabels.ts';
import { parseSlotId } from '../lib/slotId.ts';
import { tablesLabel } from '../lib/slotTables.ts';
import './BookingPage.css';
import './SlotsPage.css';
import './FloorPlanPage.css';

// Back to the schedule of the day the staff came from (sent by the "Floor plan" link).
// Without it, for instance when the URL is typed, the schedule opens on today.
function BackLink() {
  const { state } = useLocation() as { state: { date?: unknown } | null };
  const date = state?.date;
  const to = isIsoDate(date) ? `/staff/slots?date=${date}` : '/staff/slots';
  return (
    <Link to={to} className="pill floor-page__back">
      Back to the time slots
    </Link>
  );
}

function FloorPlanView({ id }: { id: number }) {
  const [selected, setSelected] = useState<string | null>(null);
  const plan = useFloorPlan(id);

  if (plan.isPending) return <p role="status">Loading the floor plan…</p>;
  if (plan.isError) {
    return (
      <p role="alert" className="notice notice--error">
        {floorErrorMessage(plan.error)}
      </p>
    );
  }

  const { slot, tables, groups, totals } = plan.data;
  if (tables.length === 0) {
    return <p className="notice notice--ok">No tables yet: hikers cannot book this slot.</p>;
  }

  return (
    <>
      <p className="floor-page__slot">
        {dateShort(fromIsoDate(slot.date))} · {slot.startTime}–{slot.endTime}
      </p>
      <FloorSummary totals={totals} />
      <div className="layout layout--staff">
        <section className="summary layout__form" aria-label="Tables">
          <h3 className="summary__title">Tables</h3>
          <p className="field__hint floor-page__meta">
            {tablesLabel(tables.length)} · {seatsTakenLabel(totals.occupiedSeats, totals.capacity)}
          </p>
          <FloorTables tables={tables} selected={selected} onSelect={setSelected} />
        </section>
        <section className="summary layout__side" aria-label="Groups">
          <h3 className="summary__title">Groups</h3>
          <FloorGroups groups={groups} slot={slot} selected={selected} onSelect={setSelected} />
        </section>
      </div>
    </>
  );
}

// The staff see where the groups of a slot are seated.
export function FloorPlanPage() {
  const { id: rawId } = useParams();
  const id = parseSlotId(rawId);
  const { data: user, isPending } = useCurrentUser();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'WARDEN';

  let content = null;
  if (!isPending) {
    if (!user) {
      content = (
        <p className="notice notice--ok">
          <Link to="/login">Log in</Link> with a staff account to see the floor plan.
        </p>
      );
    } else if (!isStaff) {
      content = <p className="notice notice--ok">This page is for the hut staff.</p>;
    } else if (id === null) {
      content = (
        <p role="alert" className="notice notice--error">
          Slot not found
        </p>
      );
    } else {
      content = <FloorPlanView id={id} />;
    }
  }

  return (
    <div className="page">
      <div className="page__body">
        <BackLink />
        <h2 className="page__title">Floor plan</h2>
        <p className="page__subtitle">
          Every seat belongs to a group: see at a glance who sits where and how many seats are free.
        </p>
        {content}
      </div>
    </div>
  );
}
