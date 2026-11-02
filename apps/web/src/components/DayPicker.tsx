import { dateShort, fromIsoDate, monthYear, weekdayShort } from '../lib/dates.ts';

interface DayPickerProps {
  dates: string[];
  value: string;
  onChange: (isoDate: string) => void;
}

export function DayPicker({ dates, value, onChange }: DayPickerProps) {
  return (
    <section className="field" aria-labelledby="when-label">
      <div className="field__head">
        <h3 id="when-label" className="field__label">
          When are you coming?
        </h3>
        <span className="field__meta">
          {monthYear(fromIsoDate(value))}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </span>
      </div>
      <div className="days" role="radiogroup" aria-labelledby="when-label">
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