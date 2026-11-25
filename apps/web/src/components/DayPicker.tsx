import { useEffect, useId, useRef, useState } from 'react';
import { dateShort, fromIsoDate, monthOf, monthYear, weekdayShort } from '../lib/dates.ts';
import { Calendar } from './Calendar.tsx';
import './DayPicker.css';

interface DayPickerProps {
  dates: string[];
  value: string;
  onChange: (isoDate: string) => void;
  label?: string;
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
  const rootRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
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
    setOpen(true);
  }

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
            <Calendar
              id={calendarId}
              value={value}
              isSelectable={(iso) => bookable.has(iso)}
              firstMonth={firstMonth}
              lastMonth={lastMonth}
              hint="Only the days with free time slots can be chosen."
              onPick={pick}
              onClose={() => close(true)}
            />
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
