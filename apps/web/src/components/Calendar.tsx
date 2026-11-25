import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { addDays, dateShort, fromIsoDate, monthOf, monthYear, toIsoDate } from '../lib/dates.ts';
import './Popover.css';
import './Calendar.css';

interface CalendarProps {
  id?: string;
  /** The chosen day (YYYY-MM-DD), shown filled; null when none is chosen yet. */
  value: string | null;
  /** Days that cannot be chosen stay visible but disabled. */
  isSelectable: (iso: string) => boolean;
  /** First and last month that can be shown (YYYY-MM-01); none means no limit. */
  firstMonth?: string;
  lastMonth?: string;
  /** Short help under the grid, e.g. which days can be chosen. */
  hint?: string;
  onPick: (iso: string) => void;
  /** Escape: the caller closes the calendar and moves the focus back. */
  onClose: () => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Days the arrows may skip looking for one that can be chosen.
const MAX_SKIP = 366;

function shiftMonth(month: string, by: number): string {
  const d = fromIsoDate(month);
  d.setMonth(d.getMonth() + by);
  return toIsoDate(d);
}

// The cells of a month grid starting on Monday: null for the blanks before the first day.
function monthCells(month: string): (string | null)[] {
  const first = fromIsoDate(month);
  const blanks = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: blanks }, () => null);
  for (let day = 1; day <= days; day++) {
    cells.push(toIsoDate(new Date(first.getFullYear(), first.getMonth(), day)));
  }
  return cells;
}

// One month view, the same on every page that asks for a date. The arrows move between the days
// that can be chosen, Page Up and Page Down between the months, Enter or Space picks the day.
export function Calendar({
  id,
  value,
  isSelectable,
  firstMonth,
  lastMonth,
  hint,
  onPick,
  onClose,
}: CalendarProps) {
  const [month, setMonth] = useState(() => monthOf(value ?? toIsoDate(new Date())));
  // The day that should take the focus after the next render, if any.
  const focusDay = useRef<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const inRange = (m: string): boolean =>
    (!firstMonth || m >= firstMonth) && (!lastMonth || m <= lastMonth);

  // On opening, the focus goes to the chosen day, or to the first day that can be chosen.
  useEffect(() => {
    const grid = gridRef.current;
    const target =
      grid?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ??
      grid?.querySelector<HTMLButtonElement>('.calendar__day:not(:disabled)');
    target?.focus();
  }, []);

  // After an arrow key: the day reached takes the focus, also when the month has changed.
  useEffect(() => {
    if (!focusDay.current) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay.current}"]`)?.focus();
    focusDay.current = null;
  });

  // The next day from `from`, `step` days at a time, that can be chosen and shown.
  function nextSelectable(from: string, step: number): string | null {
    let day = from;
    for (let i = 0; i < MAX_SKIP; i++) {
      day = addDays(day, step);
      if (!inRange(monthOf(day))) return null;
      if (isSelectable(day)) return day;
    }
    return null;
  }

  function moveTo(day: string | null) {
    if (!day) return;
    if (monthOf(day) === month) {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus();
      return;
    }
    // Another month: the day takes the focus once that month is shown.
    focusDay.current = day;
    setMonth(monthOf(day));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      // Only the calendar closes: a dialog around it stays open.
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      onClose();
      return;
    }
    const day = (e.target as HTMLElement).dataset.day;
    if (!day) return;
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in steps) {
      e.preventDefault();
      moveTo(nextSelectable(day, steps[e.key]));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const target = shiftMonth(monthOf(day), e.key === 'PageUp' ? -1 : 1);
      if (!inRange(target)) return;
      const first = isSelectable(target) ? target : nextSelectable(target, 1);
      if (first && monthOf(first) === target) moveTo(first);
      else setMonth(target);
    }
  }

  return (
    <div
      id={id}
      className="popover calendar"
      role="group"
      aria-label="Calendar"
      onKeyDown={onKeyDown}
    >
      <div className="calendar__head">
        <button
          type="button"
          className="calendar__nav"
          aria-label="Previous month"
          disabled={!inRange(shiftMonth(month, -1))}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ‹
        </button>
        <p className="calendar__title" aria-live="polite">
          {monthYear(fromIsoDate(month))}
        </p>
        <button
          type="button"
          className="calendar__nav"
          aria-label="Next month"
          disabled={!inRange(shiftMonth(month, 1))}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          ›
        </button>
      </div>
      <div className="calendar__grid" ref={gridRef}>
        {WEEKDAYS.map((day) => (
          <span key={day} className="calendar__weekday" aria-hidden="true">
            {day}
          </span>
        ))}
        {monthCells(month).map((iso, i) =>
          iso === null ? (
            <span key={`blank-${i}`} aria-hidden="true" />
          ) : (
            <button
              key={iso}
              type="button"
              className="calendar__day"
              data-day={iso}
              aria-label={dateShort(fromIsoDate(iso))}
              aria-pressed={iso === value}
              disabled={!isSelectable(iso)}
              onClick={() => onPick(iso)}
            >
              {fromIsoDate(iso).getDate()}
            </button>
          ),
        )}
      </div>
      {hint && <p className="popover__hint">{hint}</p>}
    </div>
  );
}
