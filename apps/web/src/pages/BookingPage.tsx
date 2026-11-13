import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { createBookingSchema } from '@mountain-hut/shared';
import { createBooking, fetchSlots } from '../api/bookings.ts';
import { ApiError } from '../api/client.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { BookingSummary } from '../components/BookingSummary.tsx';
import { DayPicker } from '../components/DayPicker.tsx';
import { GuestStepper, MIN_GUESTS } from '../components/GuestStepper.tsx';
import { HutHero } from '../components/HutHero.tsx';
import { isBookable, TimeSlotPicker } from '../components/TimeSlotPicker.tsx';
import { RequirementsEditor } from '../components/RequirementsEditor.tsx';
import type { RequirementDraft } from '../components/RequirementsEditor.tsx';
import { dateShort, fromIsoDate } from '../lib/dates.ts';
import { BookingSentDialog } from '../components/BookingSentDialog.tsx';
import './BookingPage.css';

const SLOTS_KEY = ['slots'] as const;

const plural = (n: number): string => (n === 1 ? '1 person' : `${n} people`);

function bookingError(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) {
    return 'The session has expired. Please log in again.';
  }

  if (e instanceof ApiError && [403, 404, 409, 422].includes(e.status)) return e.message;
  return 'Booking failed. Please try again.';
}

function BookingFlow() {
  const queryClient = useQueryClient();
  const slotsQuery = useQuery({ queryKey: SLOTS_KEY, queryFn: fetchSlots });
  const book = useMutation({
    mutationFn: createBooking,
    onSettled: () => queryClient.invalidateQueries({ queryKey: SLOTS_KEY }),
  });

  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const [requestedGuests, setRequestedGuests] = useState(2);
  const [chosenSlotId, setChosenSlotId] = useState<number | null>(null);
  const [requirements, setRequirements] = useState<RequirementDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sentSummary, setSentSummary] = useState<string | null>(null);

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

  const slot = daySlots.find((s) => s.id === chosenSlotId && isBookable(s, guests)) ?? null;

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
    const summary = `${dateShort(fromIsoDate(date))} · ${slot.startTime} · ${plural(guests)}`;
    book.mutate(parsed.data, {
      onSuccess: () => setSentSummary(summary),
      onError: (e) => setError(bookingError(e)),
    });
  }

  if (slotsQuery.isPending) return <p role="status">Loading time slots…</p>;
  if (slotsQuery.isError) {
    return (
      <p role="alert" className="notice notice--error">
        {bookingError(slotsQuery.error)}
      </p>
    );
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

        {error && (
          <p role="alert" className="notice notice--error">
            {error}
          </p>
        )}
      </div>

      <div className="layout__side">
        <BookingSummary
          dateLabel={dateShort(fromIsoDate(date))}
          time={slot?.startTime ?? null}
          guests={guests}
          tables={book.isSuccess ? book.data.tables : null}
          requirements={requirements
            .filter((r) => r.description.trim() !== '')
            .map(({ allergies, description }) => ({ allergies, description: description.trim() }))}
        />
        <aside className="experience">
          <h3>An Alpine Experience</h3>
          <p>Mountain cuisine, best enjoyed at a leisurely pace.</p>
        </aside>
      </div>

      {sentSummary && (
        <BookingSentDialog
          summary={sentSummary}
          onClose={() => {
            setSentSummary(null);
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
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'WARDEN';

  let content = null;
  if (!isPending) {
    if (!user) {
      content = (
        <p className="notice notice--ok">
          <Link to="/login">Log in</Link> to book a table.
        </p>
      );
    } else if (isStaff) {
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
