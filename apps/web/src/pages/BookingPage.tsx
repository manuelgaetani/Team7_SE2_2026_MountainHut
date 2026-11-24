import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { createBookingSchema, MAX_REQUIREMENTS_LENGTH } from '@mountain-hut/shared';
import { isStaff } from '../api/roles.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { useBookableSlots, useCreateBooking } from '../api/useBookings.ts';
import { BookingSummary } from '../components/BookingSummary.tsx';
import { DayPicker } from '../components/DayPicker.tsx';
import { GuestStepper, MIN_GUESTS } from '../components/GuestStepper.tsx';
import { HutHero } from '../components/HutHero.tsx';
import { isBookable, TimeSlotPicker } from '../components/TimeSlotPicker.tsx';
import { RequirementsEditor } from '../components/RequirementsEditor.tsx';
import type { RequirementDraft } from '../components/RequirementsEditor.tsx';
import { draftFromSearch } from '../lib/bookingRedirect.ts';
import { dateShort, fromIsoDate } from '../lib/dates.ts';
import { BookingSentDialog } from '../components/BookingSentDialog.tsx';
import './BookingPage.css';
import { apiErrorMessage } from '../lib/errors.ts';
import { ErrorNotice } from '../components/ErrorNotice.tsx';

// The API explains these cases: slot not found, full or started, not a hiker.
const bookingError = (e: unknown): string =>
  apiErrorMessage(e, 'Booking failed. Please try again.', [403, 404, 409, 422]);

const plural = (n: number): string => (n === 1 ? '1 person' : `${n} people`);

// The rows with a description, trimmed as the API stores them. The key of each row is
// kept: it identifies the requirement in the lists of the summary and of the dialog.
const filledRequirements = (rows: RequirementDraft[]): RequirementDraft[] =>
  rows
    .filter((r) => r.description.trim() !== '')
    .map((r) => ({ ...r, description: r.description.trim() }));

function BookingFlow() {
  const slotsQuery = useBookableSlots();
  const book = useCreateBooking();

  // A booking chosen in the availability check (MH-04) arrives in the address.
  const draft = draftFromSearch(useSearchParams()[0]);
  const [chosenDate, setChosenDate] = useState<string | null>(() => draft?.date ?? null);
  const [requestedGuests, setRequestedGuests] = useState(() => draft?.partySize ?? 2);
  // undefined: nothing chosen yet, so the slot of the address is taken.
  const [chosenSlotId, setChosenSlotId] = useState<number | null | undefined>(undefined);
  const [requirements, setRequirements] = useState<RequirementDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{
    summary: string;
    requirements: RequirementDraft[];
  } | null>(null);

  const slots = slotsQuery.data;
  const dates = useMemo(
    () => [...new Set((slots ?? []).map((s) => s.date))].sort((a, b) => a.localeCompare(b)),
    [slots],
  );
  const date = chosenDate && dates.includes(chosenDate) ? chosenDate : (dates[0] ?? null);

  const daySlots = useMemo(
    () =>
      (slots ?? [])
        .filter((s) => s.date === date)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [slots, date],
  );

  const maxGuests = Math.max(
    MIN_GUESTS,
    ...daySlots.filter((s) => s.availability === 'AVAILABLE').map((s) => s.freeSeats),
  );
  const guests = Math.min(requestedGuests, maxGuests);

  const linkedSlotId = draft
    ? (slots?.find((s) => s.date === draft.date && s.startTime === draft.time)?.id ?? null)
    : null;
  const selectedId = chosenSlotId === undefined ? linkedSlotId : chosenSlotId;
  const slot = daySlots.find((s) => s.id === selectedId && isBookable(s, guests)) ?? null;

  const handle =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setError(null);
      book.reset();
    };

  function handleSubmit() {
    if (!slot) return;
    setError(null);
    if (requirements.some((r) => r.description.trim() === '')) {
      setError('Describe each requirement or remove it.');
      return;
    }
    if (requirements.some((r) => r.description.trim().length > MAX_REQUIREMENTS_LENGTH)) {
      setError(`Each requirement can be at most ${MAX_REQUIREMENTS_LENGTH} characters long.`);
      return;
    }
    const parsed = createBookingSchema.safeParse({
      slotId: slot.id,
      partySize: guests,
      ...(requirements.length > 0 && {
        requirements: requirements.map(({ allergies, description }) => ({
          allergies,
          description,
        })),
      }),
    });
    if (!parsed.success) {
      setError('Choose a date, time, and number of people.');
      return;
    }
    const filled = filledRequirements(requirements);
    const summary = `${dateShort(fromIsoDate(date))} · ${slot.startTime} · ${plural(guests)}`;
    book.mutate(parsed.data, {
      // The API stores the requirements as sent, trimmed: the dialog shows the same rows.
      onSuccess: () => setSent({ summary, requirements: filled }),
      onError: (e) => setError(bookingError(e)),
    });
  }

  if (slotsQuery.isPending) return <p role="status">Loading time slots…</p>;
  if (slotsQuery.isError) {
    return <ErrorNotice message={bookingError(slotsQuery.error)} />;
  }
  if (date === null) {
    return <p className="notice notice--ok">At the moment there are no available time slots.</p>;
  }

  return (
    <div className="layout">
      <div className="layout__form">
        <DayPicker dates={dates} value={date} onChange={handle(setChosenDate)} />
        <GuestStepper value={guests} max={maxGuests} onChange={handle(setRequestedGuests)} />
        <TimeSlotPicker
          slots={daySlots}
          guests={guests}
          value={slot?.id ?? null}
          onChange={handle(setChosenSlotId)}
        />
        <RequirementsEditor value={requirements} onChange={handle(setRequirements)} />

        {slot && (
          <p className="recap">
            <strong>
              {dateShort(fromIsoDate(date))} · {slot.startTime} · {plural(guests)}
            </strong>
            <span>A table is waiting for you at {slot.startTime}</span>
          </p>
        )}

        <button
          type="button"
          className="cta"
          disabled={!slot || book.isPending}
          onClick={handleSubmit}
        >
          {book.isPending ? 'Booking in progress…' : 'Book your table'}
          <span aria-hidden="true">→</span>
        </button>

        {error && <ErrorNotice message={error} />}
      </div>

      <div className="layout__side">
        <BookingSummary
          dateLabel={dateShort(fromIsoDate(date))}
          time={slot?.startTime ?? null}
          guests={guests}
          tables={book.isSuccess ? book.data.tables : null}
          requirements={filledRequirements(requirements)}
        />
        <aside className="experience">
          <h3>An Alpine Experience</h3>
          <p>Mountain cuisine, best enjoyed at a leisurely pace.</p>
        </aside>
      </div>

      {sent && (
        <BookingSentDialog
          summary={sent.summary}
          requirements={sent.requirements}
          onClose={() => {
            setSent(null);
            setChosenSlotId(null);
            setRequirements([]);
          }}
        />
      )}
    </div>
  );
}

export function BookingPage() {
  const { data: user, isPending } = useCurrentUser();

  let content = null;
  if (!isPending) {
    if (!user) {
      content = (
        <p className="notice notice--ok">
          <Link to="/login">Log in</Link> to book a table.
        </p>
      );
    } else if (isStaff(user)) {
      content = <p className="notice notice--ok">Staff accounts cannot book a table.</p>;
    } else {
      content = <BookingFlow />;
    }
  }

  return (
    <div className="page">
      <HutHero />
      <div className="page__body">
        <h2 className="page__title">We'll hold a table for you.</h2>
        <p className="page__subtitle">Mountain cuisine, best enjoyed at a leisurely pace.</p>
        {content}
      </div>
    </div>
  );
}
