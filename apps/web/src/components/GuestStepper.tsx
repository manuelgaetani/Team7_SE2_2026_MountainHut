import { useId } from 'react';

export const MIN_GUESTS = 1;

interface GuestStepperProps {
  value: number;
  /** Upper bound; undefined means no limit. */
  max?: number;
  onChange: (guests: number) => void;
  label?: string;
  hint?: string | null;
  id?: string;
}

export function GuestStepper({
  value,
  max,
  onChange,
  label = 'How many people are in your party?',
  hint = 'Children included',
  id,
}: GuestStepperProps) {
  const generated = useId();
  const labelId = `${id ?? generated}-label`;
  return (
    <section className="field field--row" id={id}>
      <div>
        <h3 id={labelId} className="field__label">
          {label}
        </h3>
        {hint && <p className="field__hint">{hint}</p>}
      </div>
      <div className="stepper">
        <button
          type="button"
          className="stepper__btn"
          aria-label="Fewer guests"
          disabled={value <= MIN_GUESTS}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <output className="stepper__value" aria-live="polite" aria-labelledby={labelId}>
          {value}
        </output>
        <button
          type="button"
          className="stepper__btn stepper__btn--plus"
          aria-label="More guests"
          disabled={max !== undefined && value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </section>
  );
}
