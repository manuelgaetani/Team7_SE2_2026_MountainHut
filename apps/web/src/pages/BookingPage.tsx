import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { createBookingSchema } from '@mountain-hut/shared';
import type { BookingResult, SlotSummary } from '@mountain-hut/shared';
import { createBooking, fetchSlots } from '../api/bookings.ts';
import { ApiError } from '../api/client.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { FormField } from '../components/FormField.tsx';

const SLOTS_KEY = ['slots'] as const;

function slotLabel(slot: SlotSummary): string {
  const time = `${slot.startTime}–${slot.endTime}`;
  if (slot.availability === 'FULL') return `${time} (full)`;
  if (slot.availability === 'TOO_LATE') return `${time} (booking closed)`;
  return `${time} (${slot.freeSeats} ${slot.freeSeats === 1 ? 'seat' : 'seats'} left)`;
}

function bookingError(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) {
    return 'Your session has expired. Please sign in again.';
  }
  // The API explains these cases: slot gone, no seats, too late, already booked, no hiker profile.
  if (e instanceof ApiError && [403, 404, 409, 422].includes(e.status)) return e.message;
  return 'Booking failed. Please try again.';
}

function Confirmation({ booking }: { booking: BookingResult }) {
  return (
    <div role="status">
      <h2>Booking confirmed</h2>
      <p>
        {booking.partySize} {booking.partySize === 1 ? 'seat' : 'seats'} reserved:
      </p>
      <ul>
        {booking.tables.map((t) => (
          <li key={t.tableNumber}>
            Table {t.tableNumber}: {t.assignedSeats} {t.assignedSeats === 1 ? 'seat' : 'seats'}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BookingForm() {
  const queryClient = useQueryClient();
  const slots = useQuery({ queryKey: SLOTS_KEY, queryFn: fetchSlots });
  const book = useMutation({
    mutationFn: createBooking,
    onSettled: () => queryClient.invalidateQueries({ queryKey: SLOTS_KEY }),
  });
  const [date, setDate] = useState('');
  const [slotId, setSlotId] = useState('');
  const [partySize, setPartySize] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (slots.isPending) return <p>Loading the available dates…</p>;
  if (slots.isError) return <p role="alert">{bookingError(slots.error)}</p>;
  if (slots.data.length === 0) return <p>There are no dates to book yet.</p>;

  const dates = [...new Set(slots.data.map((s) => s.date))];
  const times = slots.data.filter((s) => s.date === date);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    book.reset();

    const parsed = createBookingSchema.safeParse({
      slotId: Number(slotId),
      partySize: Number(partySize),
    });
    if (!parsed.success) {
      setError('Choose a date and a time, and enter the number of people.');
      return;
    }
    book.mutate(parsed.data, { onError: (e) => setError(bookingError(e)) });
  }

  return (
    <>
      <form onSubmit={onSubmit} noValidate>
        <div>
          <label htmlFor="date">Date</label>
          <select
            id="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSlotId('');
            }}
          >
            <option value="">Choose a date</option>
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="time">Time</label>
          <select
            id="time"
            value={slotId}
            disabled={!date}
            onChange={(e) => setSlotId(e.target.value)}
          >
            <option value="">Choose a time</option>
            {times.map((s) => (
              <option key={s.id} value={s.id} disabled={s.availability !== 'AVAILABLE'}>
                {slotLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <FormField
          id="partySize"
          label="Number of people"
          type="number"
          min={1}
          value={partySize}
          onChange={(e) => setPartySize(e.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={book.isPending}>
          {book.isPending ? 'Booking…' : 'Book'}
        </button>
      </form>
      {book.isSuccess && <Confirmation booking={book.data} />}
    </>
  );
}

export function BookingPage() {
  const { data: user, isPending } = useCurrentUser();

  return (
    <section>
      <h1>Book a table</h1>
      {!isPending &&
        (user ? (
          <BookingForm />
        ) : (
          <p>
            <Link to="/login">Sign in</Link> to book a table.
          </p>
        ))}
    </section>
  );
}
