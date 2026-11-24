import { useId } from 'react';
import type { SlotSummary } from '@mountain-hut/shared';

// eslint-disable-next-line react-refresh/only-export-components
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
  const selected = slots.find((s) => s.id === value);
  const range =
    slots.length > 0 ? `${slots[0].startTime}–${slots[slots.length - 1].endTime}` : null;

  return (
    <section className="field" aria-labelledby={labelId}>
      <div className="field__head">
        <h3 id={labelId} className="field__label">
          {label}
        </h3>
        {range && <span className="field__meta">{range}</span>}
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
