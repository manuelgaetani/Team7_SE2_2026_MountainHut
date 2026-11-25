import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { dateShort, fromIsoDate, monthYear, toIsoDate, weekdayShort } from '../lib/dates.ts';
import './DayPicker.css';

interface DayPickerProps {
  dates: string[];
  value: string;
  onChange: (isoDate: string) => void;
  label?: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The first day of the month of a YYYY-MM-DD date, as YYYY-MM-01.
const monthOf = (iso: string): string => `${iso.slice(0, 7)}-01`;

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

export function DayPicker({
  dates,
  value,
  onChange,
  label = 'When are you coming?',
}: DayPickerProps) {
  const labelId = useId();
  const calendarId = useId();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthOf(value));
  const rootRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const bookable = new Set(dates);
  const sorted = [...dates].sort((a, b) => a.localeCompare(b));
  const firstMonth = sorted.length > 0 ? monthOf(sorted[0]) : monthOf(value);
  const lastMonth = sorted.length > 0 ? monthOf(sorted[sorted.length - 1]) : monthOf(value);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }

  function toggle() {
    if (open) {
      close(false);
      return;
    }
    setMonth(monthOf(value));
    setOpen(true);
  }

  // On opening, the focus goes to the chosen day, or to the first day that can be chosen.
  useEffect(() => {
    if (!open) return;
    const calendar = calendarRef.current;
    const target =
      calendar?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ??
      calendar?.querySelector<HTMLButtonElement>('.calendar__day:not(:disabled)');
    target?.focus();
  }, [open]);

  // A click outside the picker closes the calendar.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // The chosen day stays in sight in the strip, also when it was picked in the calendar.
  useEffect(() => {
    const chip = stripRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    chip?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [value]);

  function pick(iso: string) {
    onChange(iso);
    close(true);
  }

  function onCalendarKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Escape') return;
    // Only the calendar closes: a dialog around the picker stays open.
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    close(true);
  }

  const shown = monthYear(fromIsoDate(value));

  return (
    <section className="field day-picker" aria-labelledby={labelId} ref={rootRef}>
      <div className="field__head">
        <h3 id={labelId} className="field__label">
          {label}
        </h3>
        {/* The calendar floats under this button, over the content: the day strip does not move. */}
        <div className="day-picker__anchor">
          <button
            ref={toggleRef}
            type="button"
            className="field__meta day-picker__toggle"
            aria-expanded={open}
            aria-controls={open ? calendarId : undefined}
            aria-label={`${shown}, choose a date from the calendar`}
            title="Choose a date from the calendar"
            onClick={toggle}
          >
            {shown}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="3.5"
                y="5"
                width="17"
                height="15"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>

          {open && (
            <div
              id={calendarId}
              ref={calendarRef}
              className="calendar"
              role="group"
              aria-label="Calendar"
              onKeyDown={onCalendarKeyDown}
            >
              <div className="calendar__head">
                <button
                  type="button"
                  className="calendar__nav"
                  aria-label="Previous month"
                  disabled={month <= firstMonth}
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
                  disabled={month >= lastMonth}
                  onClick={() => setMonth(shiftMonth(month, 1))}
                >
                  ›
                </button>
              </div>
              <div className="calendar__grid">
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
                      aria-label={dateShort(fromIsoDate(iso))}
                      aria-pressed={iso === value}
                      disabled={!bookable.has(iso)}
                      onClick={() => pick(iso)}
                    >
                      {fromIsoDate(iso).getDate()}
                    </button>
                  ),
                )}
              </div>
              <p className="calendar__hint">Only the days with free time slots can be chosen.</p>
            </div>
          )}
        </div>
      </div>

      <div className="days" role="radiogroup" aria-labelledby={labelId} ref={stripRef}>
        {dates.map((iso) => {
          const d = fromIsoDate(iso);
          return (
            <button
              key={iso}
              type="button"
              role="radio"
              aria-checked={iso === value}
              aria-label={dateShort(d)}
              className="choice day"
              onClick={() => onChange(iso)}
            >
              <span className="day__weekday">{weekdayShort(d)}</span>
              <span className="day__number">{d.getDate()}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
