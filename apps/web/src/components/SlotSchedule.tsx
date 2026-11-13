import { Link } from 'react-router';
import type { SlotDetails } from '../api/slots.ts';
import { seatsLabel, tablesLabel } from '../lib/slotTables.ts';

interface SlotScheduleProps {
  slots: SlotDetails[];
  onDefineTables: (slot: SlotDetails) => void;
}

// The slots of one day with their tables, as the staff see them.
export function SlotSchedule({ slots, onDefineTables }: SlotScheduleProps) {
  if (slots.length === 0) {
    return <p className="notice notice--ok">No time slots on this day yet.</p>;
  }

  return (
    <ul className="schedule" aria-label="Time slots of the day">
      {slots.map((slot) => (
        <li key={slot.id} className="summary schedule__slot">
          <div className="schedule__head">
            <h3 className="summary__title">
              {slot.startTime}–{slot.endTime}
            </h3>
            <span className="field__meta">
              {tablesLabel(slot.tables.length)} · {seatsLabel(slot.totalSeats)}
            </span>
          </div>
          {slot.tables.length > 0 ? (
            <div className="schedule__empty">
              <ul className="schedule__tables">
                {slot.tables.map((t) => (
                  <li key={t.tableNumber} className="schedule__table">
                    Table {t.tableNumber} · {seatsLabel(t.seats)}
                  </li>
                ))}
              </ul>
              <FloorPlanLink slot={slot} />
            </div>
          ) : (
            <div className="schedule__empty">
              <p className="field__hint">No tables yet: hikers cannot book this slot.</p>
              <div className="schedule__actions">
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
  );
}

function FloorPlanLink({ slot }: { slot: SlotDetails }) {
  return (
    <Link
      to={`/staff/slots/${slot.id}/floor`}
      state={{ date: slot.date }}
      className="pill pill--primary schedule__floor"
      aria-label={`Floor plan of ${slot.startTime}–${slot.endTime}`}
    >
      Floor plan
    </Link>
  );
}
