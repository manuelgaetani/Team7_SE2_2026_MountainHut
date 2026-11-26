import { useEffect, useId, useRef, useState } from 'react';
import type { SlotSummary } from '@mountain-hut/shared';
import { TimeList } from './TimeList.tsx';

export const isBookable = (slot: SlotSummary, guests: number): boolean =>
  slot.availability === 'AVAILABLE' && slot.freeSeats >= guests;

const defaultReason = (slot: SlotSummary, guests: number): string | null => {
  if (slot.availability === 'TOO_LATE') return 'Closed';
  if (slot.availability === 'FULL' || slot.freeSeats === 0) return 'Full';
  if (slot.freeSeats < guests)
    return `Only ${slot.freeSeats} ${slot.freeSeats === 1 ? 'seat' : 'seats'}`;
  return null;
};

interface TimeSlotPickerProps {
  slots: SlotSummary[];
  guests: number;
  value: number | null;
  onChange: (slotId: number) => void;
  label?: string;
  canChoose?: (slot: SlotSummary) => boolean;
  reason?: (slot: SlotSummary) => string | null;
}

export function TimeSlotPicker({
  slots,
  guests,
  value,
  onChange,
  label = 'What time?',
  canChoose = (s) => isBookable(s, guests),
  reason = (s) => defaultReason(s, guests),
}: TimeSlotPickerProps) {
  const labelId = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const selected = slots.find((s) => s.id === value);
  const range =
    slots.length > 0 ? `${slots[0].startTime}–${slots[slots.length - 1].endTime}` : null;

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }

  // A click outside the picker closes the list.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function pick(slotId: number) {
    onChange(slotId);
    close(true);
  }

  return (
    <section className="field picker" aria-labelledby={labelId} ref={rootRef}>
      <div className="field__head">
        <h3 id={labelId} className="field__label">
          {label}
        </h3>
        {/* The list floats under this button, over the content: the time buttons do not move. */}
        {range && (
          <div className="picker-anchor">
            <button
              ref={toggleRef}
              type="button"
              className="field__meta picker-toggle"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-label={`${range}, choose a time from the list`}
              title="Choose a time from the list"
              onClick={() => (open ? close(false) : setOpen(true))}
            >
              {range}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>

            {open && (
              <TimeList
                id={listId}
                slots={slots}
                value={value}
                canChoose={canChoose}
                reason={reason}
                hint="Times that are full or closed cannot be chosen."
                onPick={pick}
                onClose={() => close(true)}
              />
            )}
          </div>
        )}
      </div>
      <div className="slots" role="radiogroup" aria-labelledby={labelId}>
        {slots.map((slot) => {
          const why = reason(slot);
          return (
            <button
              key={slot.id}
              type="button"
              role="radio"
              aria-checked={slot.id === value}
              disabled={!canChoose(slot)}
              className="choice slot"
              onClick={() => onChange(slot.id)}
            >
              {slot.startTime}–{slot.endTime}
              {why && (
                <>
                  {' '}
                  <span className="slot__reason">{why}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {selected && (
        <p className="field__confirm">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m5 12 5 5 9-10" stroke="currentColor" strokeWidth="2.4" />
          </svg>
          A table is waiting for you at {selected.startTime}
        </p>
      )}
    </section>
  );
}
