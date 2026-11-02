export const MIN_GUESTS = 1;
export const MAX_GUESTS = 12;

interface GuestStepperProps {
  value: number;
  max: number;
  onChange: (guests: number) => void;
}

export function GuestStepper({ value, max, onChange }: GuestStepperProps) {
  return (
    <section className="field field--row">
      <div>
        <h3 className="field__label">How many people are in your party?</h3>
        <p className="field__hint">Children included</p>
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
        <output className="stepper__value" aria-live="polite">
          {value}
        </output>
        <button
          type="button"
          className="stepper__btn stepper__btn--plus"
          aria-label="Più ospiti"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </section>
  );
}
