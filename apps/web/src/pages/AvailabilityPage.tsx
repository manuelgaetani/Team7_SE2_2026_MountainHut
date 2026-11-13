import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { checkAvailabilityQuerySchema } from '@mountain-hut/shared';
import type { AvailabilityResult, CheckAvailabilityQuery } from '@mountain-hut/shared';
import { useCurrentUser } from '../api/useAuth.ts';
import { useAvailability } from '../api/useAvailability.ts';
import { FormField } from '../components/FormField.tsx';
import { toIsoDate } from '../lib/dates.ts';
import { askedLabel, availabilityError, unavailableReason } from '../lib/availability.ts';
import './BookingPage.css';
import './AvailabilityPage.css';

type Field = 'date' | 'time' | 'partySize';

const FIELD_ERRORS: Record<Field, string> = {
  date: 'Choose a date.',
  time: 'Choose a time.',
  partySize: 'Enter the number of people, 1 or more.',
};

function Result({ result }: { result: AvailabilityResult }) {
  const { data: user } = useCurrentUser();

  if (!result.available) {
    return (
      <div className="summary availability-result availability-result--no" role="alert">
        <p className="availability-result__status">Not available</p>
        <p className="availability-result__asked">{askedLabel(result)}</p>
        <p>{unavailableReason(result)}</p>
      </div>
    );
  }

  return (
    <div className="summary availability-result availability-result--ok" aria-live="polite">
      <p className="availability-result__status">Available</p>
      <p className="availability-result__asked">{askedLabel(result)}</p>
      {result.breakdownText && <p>Table layout: {result.breakdownText}</p>}
      {result.tables && (
        <ul className="availability-result__tables" aria-label="Tables for the party">
          {result.tables.map((t) => (
            <li key={t.tableNumber}>
              Table {t.tableNumber} · {t.seats === 1 ? '1 seat' : `${t.seats} seats`}
            </li>
          ))}
        </ul>
      )}
      <Link to={user ? '/book' : '/register'} className="pill">
        {user ? 'Book a table' : 'Register to book a table'}
      </Link>
    </div>
  );
}

// MH-04: anyone, logged in or not, checks if a slot has a table for their party.
export function AvailabilityPage() {
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [time, setTime] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [asked, setAsked] = useState<CheckAvailabilityQuery | null>(null);
  const check = useAvailability(asked);

  // A changed field hides the answer about the previous values.
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setErrors({});
    setAsked(null);
  };

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = checkAvailabilityQuerySchema.safeParse({ date, time, partySize });
    if (!parsed.success) {
      const found: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        found[field] = FIELD_ERRORS[field];
      }
      setErrors(found);
      setAsked(null);
      return;
    }
    setErrors({});
    setAsked(parsed.data);
  }

  return (
    <div className="page">
      <div className="page__body">
        <h2 className="page__title">Check availability</h2>
        <p className="page__subtitle">
          See if the hut has a table for your party. No account needed.
        </p>

        <div className="availability">
          <form className="summary availability-form" onSubmit={onSubmit} noValidate>
            <div className="availability-form__fields">
              <FormField
                id="availability-date"
                label="Date"
                type="date"
                value={date}
                error={errors.date}
                onChange={(e) => edit(setDate)(e.target.value)}
              />
              <FormField
                id="availability-time"
                label="Time"
                type="time"
                value={time}
                error={errors.time}
                onChange={(e) => edit(setTime)(e.target.value)}
              />
              <FormField
                id="availability-party"
                label="Party size"
                type="number"
                min={1}
                inputMode="numeric"
                value={partySize}
                error={errors.partySize}
                onChange={(e) => edit(setPartySize)(e.target.value)}
              />
            </div>
            <button type="submit" className="cta" disabled={check.isFetching}>
              {check.isFetching ? 'Checking…' : 'Check availability'}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          {check.isPending && check.isFetching && <p role="status">Checking the slot…</p>}
          {check.isError && (
            <p role="alert" className="notice notice--error">
              {availabilityError(check.error)}
            </p>
          )}
          {check.isSuccess && <Result result={check.data} />}
        </div>
      </div>
    </div>
  );
}
