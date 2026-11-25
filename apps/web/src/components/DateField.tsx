import { useEffect, useId, useRef, useState } from 'react';
import { dateShort, fromIsoDate, monthOf } from '../lib/dates.ts';
import { Calendar } from './Calendar.tsx';
import './DateField.css';

interface DateFieldProps {
  id: string;
  label: string;
  /** The chosen day, YYYY-MM-DD; empty when none is chosen. */
  value: string;
  onChange: (iso: string) => void;
  /** First day that can be chosen, YYYY-MM-DD: the days before it are disabled. */
  min?: string;
  error?: string | undefined;
  hint?: string;
}

const CalendarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

// A date chosen in the calendar of the site, the same one as on the Book a table page.
export function DateField({ id, label, value, onChange, min, error, hint }: DateFieldProps) {
  const valueId = useId();
  const calendarId = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // A click outside the field closes the calendar.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  const shown = value
    ? `${dateShort(fromIsoDate(value))} ${fromIsoDate(value).getFullYear()}`
    : 'Choose a date';
  const describedBy =
    [valueId, hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field date-field" ref={rootRef}>
      <label htmlFor={id}>{label}</label>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="date-field__button"
        aria-expanded={open}
        aria-controls={open ? calendarId : undefined}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span id={valueId} className={value ? undefined : 'date-field__placeholder'}>
          {shown}
        </span>
        <CalendarIcon />
      </button>
      {open && (
        <Calendar
          id={calendarId}
          value={value || null}
          isSelectable={(iso) => !min || iso >= min}
          firstMonth={min ? monthOf(min) : undefined}
          onPick={(iso) => {
            onChange(iso);
            close();
          }}
          onClose={close}
        />
      )}
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
