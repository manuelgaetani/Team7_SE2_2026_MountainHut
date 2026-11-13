import type { FloorPlan } from '@mountain-hut/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useCurrentUser } from '../api/useAuth.ts';
import { useFloorPlan } from '../api/useSlots.ts';
import { FloorGroups } from '../components/FloorGroups.tsx';
import { FloorHeader } from '../components/FloorHeader.tsx';
import { FloorMomentPicker } from '../components/FloorMomentPicker.tsx';
import { FloorTables } from '../components/FloorTables.tsx';
import { floorErrorMessage, otherSlotsLabel, seatsTakenLabel } from '../lib/floorLabels.ts';
import { floorMoments, isSlotGroup } from '../lib/floorMoments.ts';
import { parseSlotId } from '../lib/slotId.ts';
import { tablesLabel } from '../lib/slotTables.ts';
import './BookingPage.css';
import './SlotsPage.css';
import './FloorPlanPage.css';

function FloorPlanView({ id }: { id: number }) {
  const plan = useFloorPlan(id);

  let body;
  if (plan.isPending) body = <p role="status">Loading the floor plan…</p>;
  else if (plan.isError) {
    body = (
      <p role="alert" className="notice notice--error">
        {floorErrorMessage(plan.error)}
      </p>
    );
  } else body = <FloorPlanContent plan={plan.data} />;

  return (
    <>
      <FloorHeader slot={plan.data?.slot} />
      {body}
    </>
  );
}

function FloorPlanContent({ plan }: { plan: FloorPlan }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [current, setCurrent] = useState(0);

  const { slot, tables } = plan;
  if (tables.length === 0) {
    return <p className="notice notice--ok">No tables yet: hikers cannot book this slot.</p>;
  }

  const moments = floorMoments(plan);
  const index = Math.min(current, moments.length - 1);
  const moment = moments[index]!;
  const shared = moments.some((m) => m.otherSlots.length > 0);
  const groups = plan.groups.filter((g) => isSlotGroup(g, slot));
  const guests = groups.reduce((sum, g) => sum + g.partySize, 0);

  function select(label: string | null) {
    setSelected(label);
    setShowAll(false);
  }

  return (
    <div className="layout layout--staff">
      <section className="summary layout__form" aria-label="Tables">
        <h3 className="summary__title">Tables</h3>
        {shared ? (
          <FloorMomentPicker moments={moments} current={index} onPick={setCurrent} />
        ) : (
          <p className="field__hint floor-page__meta">
            {tablesLabel(tables.length)} · {seatsTakenLabel(moment.occupiedSeats, moment.capacity)}
          </p>
        )}
        <FloorTables
          tables={moment.tables}
          otherSlots={moment.otherSlots}
          selected={selected}
          showAll={showAll}
          onSelect={select}
        />
        <ul className="floor-legend" aria-label="Legend">
          <li>
            <span className="floor-seat floor-seat--free" aria-hidden="true" />
            Free
          </li>
          {groups.length > 0 && (
            <li>
              <span className="floor-seat floor-seat--booked" aria-hidden="true" />
              Booked in this slot
            </li>
          )}
          {moment.otherSlots.length > 0 && (
            <li>
              <span className="floor-seat floor-seat--other" aria-hidden="true" />
              Taken by {otherSlotsLabel(moment.otherSlots)}
            </li>
          )}
        </ul>
      </section>
      <section className="summary layout__side" aria-label="Groups">
        <h3 className="summary__title">Groups</h3>
        {groups.length > 0 && (
          <p className="field__hint floor-page__meta">
            {groups.length === 1 ? '1 group' : `${groups.length} groups`} ·{' '}
            {guests === 1 ? '1 guest' : `${guests} guests`}
          </p>
        )}
        <FloorGroups groups={groups} selected={selected} onSelect={select} />
        {groups.length > 0 && (
          <button
            type="button"
            className="pill floor-page__all"
            aria-pressed={showAll}
            onClick={() => {
              setShowAll(!showAll);
              setSelected(null);
            }}
          >
            {showAll ? 'Hide all groups' : 'Show all groups'}
          </button>
        )}
      </section>
    </div>
  );
}

// The staff see where the groups of a slot are seated.
export function FloorPlanPage() {
  const { id: rawId } = useParams();
  const id = parseSlotId(rawId);
  const { data: user, isPending } = useCurrentUser();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'WARDEN';

  let content = null;
  let showsPlan = false;
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
      showsPlan = true;
    }
  }

  return (
    <div className="page">
      <div className="page__body">
        {!showsPlan && <FloorHeader />}
        {content}
      </div>
    </div>
  );
}
