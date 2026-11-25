import { Link } from 'react-router';
import type { SlotDetails } from '../api/slots.ts';
import { useSlotMenu } from '../api/useMenus.ts';
import { useFloorPlan } from '../api/useSlots.ts';
import { coursesLabel } from '../lib/menu.ts';
import { seatsLabel, tablesLabel } from '../lib/slotTables.ts';
import { FILL_LABELS, LEGEND_LABELS, tableFill, takenLabel } from '../lib/tableFill.ts';

interface SlotScheduleProps {
  slots: SlotDetails[];
  onDefineTables: (slot: SlotDetails) => void;
  onDefineMenu: (slot: SlotDetails) => void;
}

// The slots of one day with their tables, as the staff see them.
export function SlotSchedule({ slots, onDefineTables, onDefineMenu }: SlotScheduleProps) {
  if (slots.length === 0) {
    return <p className="notice notice--ok">No time slots on this day yet.</p>;
  }

  return (
    <>
      {slots.some((s) => s.tables.length > 0) && <FillLegend />}
      <ul className="schedule" aria-label="Time slots of the day">
        {slots.map((slot) => (
          <li key={slot.id} className="summary schedule__slot">
            <div className="schedule__head">
              <h3 className="summary__title">
                {slot.startTime}–{slot.endTime}
              </h3>
              {slot.tables.length > 0 ? (
                <SlotSeats slot={slot} />
              ) : (
                <span className="field__meta">
                  {tablesLabel(0)} · {seatsLabel(0)}
                </span>
              )}
            </div>
            {slot.tables.length > 0 ? (
              <div className="schedule__empty">
                <ScheduleTables slot={slot} />
                <div className="schedule__actions">
                  <MenuAction slot={slot} onDefineMenu={onDefineMenu} />
                  <FloorPlanLink slot={slot} />
                </div>
              </div>
            ) : (
              <div className="schedule__empty">
                <p className="field__hint">No tables yet: hikers cannot book this slot.</p>
                <div className="schedule__actions">
                  <MenuAction slot={slot} onDefineMenu={onDefineMenu} />
                  <FloorPlanLink slot={slot} />
                  <button
                    type="button"
                    className="pill"
                    aria-label={`Define the tables of ${slot.startTime}–${slot.endTime}`}
                    onClick={() => onDefineTables(slot)}
                  >
                    Define tables
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

// What the colours of the tables mean. The samples look like the tables they explain.
function FillLegend() {
  return (
    <div className="schedule-legend">
      <span id="schedule-legend-title" className="schedule-legend__title">
        Table colours
      </span>
      <ul className="schedule-legend__items" aria-labelledby="schedule-legend-title">
        {(['free', 'partial', 'full'] as const).map((fill) => (
          <li key={fill} className={`schedule__table schedule__table--${fill}`}>
            {LEGEND_LABELS[fill]}
          </li>
        ))}
      </ul>
    </div>
  );
}

// The tables of a slot and its seats taken out of all its seats: "6 tables · 22/24 seats taken".
// It reads the same floor plan as the tables below, so there is no extra request. Until the
// plan arrives it says so; if it fails, it shows the seats only.
function SlotSeats({ slot }: { slot: SlotDetails }) {
  const floor = useFloorPlan(slot.id);
  // The sum of the tables below, so the two numbers always agree.
  const taken = floor.data?.tables.reduce((sum, t) => sum + t.occupiedSeats, 0);
  return (
    <span className="field__meta">
      {tablesLabel(slot.tables.length)} ·{' '}
      {floor.isPending ? (
        <span>Loading seats…</span>
      ) : taken === undefined ? (
        seatsLabel(slot.totalSeats)
      ) : (
        takenLabel(taken, slot.totalSeats)
      )}
    </span>
  );
}

// The tables of a slot with their seats, green when free, yellow when partly taken and red when
// full.
// The seats taken come from the floor plan of the slot; until it arrives, or if it fails,
// the tables keep the neutral colour.
function ScheduleTables({ slot }: { slot: SlotDetails }) {
  const floor = useFloorPlan(slot.id);
  const taken = new Map(
    floor.data?.tables.map((t): [number, number] => [t.tableNumber, t.occupiedSeats]),
  );

  return (
    <ul className="schedule__tables">
      {slot.tables.map((t) => {
        const occupied = taken.get(t.tableNumber);
        const fill = occupied === undefined ? null : tableFill(t.seats, occupied);
        return (
          <li
            key={t.tableNumber}
            className={fill ? `schedule__table schedule__table--${fill}` : 'schedule__table'}
          >
            Table {t.tableNumber} · {seatsLabel(t.seats)}
            {fill && <span className="schedule__fill">, {FILL_LABELS[fill]}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function FloorPlanLink({ slot }: { slot: SlotDetails }) {
  return (
    <Link
      to={`/staff/slots/${slot.id}/floor`}
      state={{ date: slot.date }}
      className="cta schedule__floor"
      aria-label={`Floor plan of ${slot.startTime}–${slot.endTime}`}
    >
      Floor plan
    </Link>
  );
}

// MH-10: write the menu of a slot, or change it. The courses say whether it is written.
function MenuAction({
  slot,
  onDefineMenu,
}: {
  slot: SlotDetails;
  onDefineMenu: (slot: SlotDetails) => void;
}) {
  const menu = useSlotMenu(slot.id);
  const time = `${slot.startTime}–${slot.endTime}`;
  const written = menu.data ?? null;
  return (
    <span className="schedule__menu">
      {written && (
        <span className="field__meta schedule__menu-meta">
          Menu · {coursesLabel(written.courses.length)}
        </span>
      )}
      <button
        type="button"
        className="pill schedule__menu-button"
        disabled={menu.isPending}
        aria-label={`${written ? 'Edit' : 'Define'} the menu of ${time}`}
        onClick={() => onDefineMenu(slot)}
      >
        {written ? 'Edit menu' : 'Define menu'}
      </button>
    </span>
  );
}
