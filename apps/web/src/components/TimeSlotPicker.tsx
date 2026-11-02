import type { SlotSummary } from '@mountain-hut/shared';

export const isBookable = (slot: SlotSummary, guests: number): boolean =>
  slot.availability === 'AVAILABLE' && slot.freeSeats >= guests;

interface TimeSlotPickerProps {
  slots: SlotSummary[];
  guests: number;
  value: number | null;
  onChange: (slotId: number) => void;
}

export function TimeSlotPicker({ slots, guests, value, onChange }: TimeSlotPickerProps) {
  const selected = slots.find((s) => s.id === value);
  const range =
    slots.length > 0 ? `${slots[0].startTime}–${slots[slots.length - 1].endTime}` : null;

  return (
    <section className="field" aria-labelledby="time-label">
      <div className="field__head">
        <h3 id="time-label" className="field__label">
          When?
        </h3>
        {range && <span className="field__meta">Lunch · {range}</span>}
      </div>
      <div className="slots" role="radiogroup" aria-labelledby="time-label">
        {slots.map((slot) => (
          <button
            key={slot.id}
            type="button"
            role="radio"
            aria-checked={slot.id === value}
            disabled={!isBookable(slot, guests)}
            title={slot.availability === 'TOO_LATE' ? 'Bookings closed for this time slot' : undefined}
            className="choice slot"
            onClick={() => onChange(slot.id)}
          >
            {slot.startTime}
          </button>
        ))}
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