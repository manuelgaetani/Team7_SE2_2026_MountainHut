import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { joinTime, normalizeTime, splitTime } from '../lib/time.ts';
import './Popover.css';
import './TimeField.css';

interface TimeFieldProps {
  id: string;
  label: string;
  /** HH:MM, or what the person is typing; empty when no time is chosen. */
  value: string;
  onChange: (time: string) => void;
  error?: string | undefined;
  hint?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
// The list offers every five minutes; any other minute can be typed in the field.
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n: number): string => String(n).padStart(2, '0');

const ClockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

// Any time of the day: typed in the field ("19:40", "1940") or chosen in the panel of the
// clock button, an hour and then a minute. Same look as the date field and its calendar.
export function TimeField({ id, label, value, onChange, error, hint }: TimeFieldProps) {
  const panelId = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { hour, minute } = splitTime(value);

  // A click outside the field closes the panel.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // On opening, the chosen hour (or the first one) takes the focus, both columns show the
  // chosen time.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    // Each column scrolls to its chosen value; the page itself does not move.
    panel?.querySelectorAll<HTMLElement>('[aria-pressed="true"]').forEach((b) => {
      const list = b.parentElement;
      if (list)
        list.scrollTop = b.offsetTop - list.offsetTop - (list.clientHeight - b.offsetHeight) / 2;
    });
    const target =
      panel?.querySelector<HTMLButtonElement>('[data-column="hour"][aria-pressed="true"]') ??
      panel?.querySelector<HTMLButtonElement>('[data-column="hour"]');
    target?.focus({ preventScroll: true });
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function pickHour(h: number) {
    onChange(joinTime(h, minute ?? 0));
    // Then the minute: the focus moves to its column.
    const minuteButton =
      panelRef.current?.querySelector<HTMLButtonElement>(
        `[data-column="minute"][data-value="${minute ?? 0}"]`,
      ) ?? panelRef.current?.querySelector<HTMLButtonElement>('[data-column="minute"]');
    minuteButton?.focus();
  }

  function pickMinute(m: number) {
    onChange(joinTime(hour ?? 12, m));
    close();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      // Only the panel closes: a dialog around it stays open.
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close();
      return;
    }
    const target = e.target as HTMLElement;
    const column = target.dataset.column;
    if (!column) return;
    const buttons = [
      ...(panelRef.current?.querySelectorAll<HTMLButtonElement>(`[data-column="${column}"]`) ?? []),
    ];
    const at = buttons.indexOf(target as HTMLButtonElement);
    const last = buttons.length - 1;
    const moves: Record<string, number> = {
      ArrowUp: Math.max(at - 1, 0),
      ArrowDown: Math.min(at + 1, last),
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      buttons[moves[e.key]].focus();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      // Between the columns, onto the chosen value of the other one.
      e.preventDefault();
      const other = column === 'hour' ? 'minute' : 'hour';
      const panel = panelRef.current;
      (
        panel?.querySelector<HTMLButtonElement>(`[data-column="${other}"][aria-pressed="true"]`) ??
        panel?.querySelector<HTMLButtonElement>(`[data-column="${other}"]`)
      )?.focus();
    }
  }

  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field time-field" ref={rootRef}>
      <label htmlFor={id}>{label}</label>
      <div className="time-field__box">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="hh:mm"
          maxLength={5}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            const time = normalizeTime(e.target.value);
            if (time !== e.target.value) onChange(time);
          }}
        />
        <button
          ref={buttonRef}
          type="button"
          className="time-field__toggle"
          aria-label="Choose hour and minutes"
          title="Choose hour and minutes"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          <ClockIcon />
        </button>
      </div>

      {open && (
        <div
          id={panelId}
          ref={panelRef}
          className="popover time-picker"
          role="group"
          aria-label="Hour and minutes"
          onKeyDown={onKeyDown}
        >
          <p className="time-picker__shown" aria-live="polite">
            {value && hour !== null ? value : '--:--'}
          </p>
          <div className="time-picker__columns">
            <div className="time-picker__column" role="group" aria-label="Hour">
              <span className="time-picker__head" aria-hidden="true">
                Hour
              </span>
              <div className="time-picker__list">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className="time-picker__option"
                    data-column="hour"
                    data-value={h}
                    aria-label={`${pad(h)} hours`}
                    aria-pressed={h === hour}
                    onClick={() => pickHour(h)}
                  >
                    {pad(h)}
                  </button>
                ))}
              </div>
            </div>
            <div className="time-picker__column" role="group" aria-label="Minute">
              <span className="time-picker__head" aria-hidden="true">
                Minute
              </span>
              <div className="time-picker__list">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="time-picker__option"
                    data-column="minute"
                    data-value={m}
                    aria-label={`${pad(m)} minutes`}
                    aria-pressed={m === minute}
                    onClick={() => pickMinute(m)}
                  >
                    {pad(m)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="popover__hint">Choose the hour, then the minutes. Or type any time.</p>
        </div>
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
