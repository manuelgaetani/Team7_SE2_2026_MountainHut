import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  createStaffBookingSchema,
  MAX_REQUIREMENTS_LENGTH,
  type PartyRequirement,
  type StaffBookingHiker,
  type StaffBookingResult,
} from '@mountain-hut/shared';
import { ApiError } from '../api/client.ts';
import type { SlotDetails } from '../api/slots.ts';
import { isStaff } from '../api/roles.ts';
import { useCurrentUser } from '../api/useAuth.ts';
import { useBookableSlots } from '../api/useBookings.ts';
import { useSchedule } from '../api/useSlots.ts';
import { useCreateStaffBooking } from '../api/useStaffBookings.ts';
import { FormField } from '../components/FormField.tsx';
import { HikerPicker } from '../components/HikerPicker.tsx';
import { RequirementsEditor, type RequirementDraft } from '../components/RequirementsEditor.tsx';
import { StaffBookingDoneDialog } from '../components/StaffBookingDoneDialog.tsx';
import { StaffBookingErrorDialog } from '../components/StaffBookingErrorDialog.tsx';
import { dateLong, fromIsoDate, toIsoDate } from '../lib/dates.ts';
import {
  emptyHikerDraft,
  type FieldErrors,
  type HikerDraft,
  type HikerMode,
} from '../lib/hikerDraft.ts';
import './BookingPage.css';
import './StaffBookingPage.css';

const FOOTER_TEXT: Record<HikerMode, string> = {
  EXISTING: 'This booking will be linked to the selected hiker.',
  TEMPORARY: 'A temporary hiker will be saved with this booking.',
  ACCOUNT: 'A regular hiker profile will be created with this booking.',
};

// Clearer than the generic Zod messages for these fields.
const FIELD_MESSAGES: FieldErrors = {
  slotId: 'Choose a time slot.',
  partySize: 'Enter at least 1 person.',
  email: 'Enter a valid email address.',
  requirements: `Describe each requirement in at most ${MAX_REQUIREMENTS_LENGTH} characters.`,
};

const people = (n: number): string => (n === 1 ? '1 person' : `${n} people`);
const seats = (n: number): string => (n === 1 ? '1 free seat' : `${n} free seats`);

// MH-05: one entry per subset of the party. The list is left out when there are no needs.
const toRequirements = (rows: RequirementDraft[]): PartyRequirement[] | undefined =>
  rows.length === 0
    ? undefined
    : rows.map(({ allergies, description }) => ({ allergies, description }));

// Empty optional fields are left out of the request.
const optional = (s: string): string | undefined => (s.trim() === '' ? undefined : s);

// The only time limit for the staff: a slot cannot be booked once it has started.
function hasStarted(slot: SlotDetails, now: Date): boolean {
  const [hours, minutes] = slot.startTime.split(':').map(Number);
  const start = fromIsoDate(slot.date);
  start.setHours(hours, minutes);
  return start <= now;
}

// Why a slot cannot be chosen; empty when it can. freeSeats is unknown until GET /slots answers.
function slotNote(slot: SlotDetails, now: Date, freeSeats: number | undefined): string {
  if (hasStarted(slot, now)) return ' (already started)';
  if (slot.totalSeats === 0) return ' (no tables)';
  if (freeSeats === 0) return ' (full)';
  return '';
}

function toHiker(draft: HikerDraft): StaffBookingHiker | null {
  if (draft.mode === 'EXISTING') {
    return draft.selected ? { kind: 'EXISTING', hikerId: draft.selected.id } : null;
  }
  if (draft.mode === 'TEMPORARY') {
    return { kind: 'TEMPORARY', fullName: draft.fullName, phone: optional(draft.phone) };
  }
  return {
    kind: 'ACCOUNT',
    fullName: draft.fullName,
    email: draft.email,
    phone: draft.phone,
    notes: optional(draft.notes),
    emergencyContact: optional(draft.emergencyContact),
  };
}

// The API explains these cases: slot started or full, email already used, not a staff account.
function bookingError(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) {
    return 'The session has expired. Please log in again.';
  }
  if (e instanceof ApiError && [403, 404, 409, 422].includes(e.status)) return e.message;
  return 'The booking could not be created. Please try again.';
}

function StaffBookingForm({ onReset }: { onReset: () => void }) {
  const navigate = useNavigate();
  const createBooking = useCreateStaffBooking();
  const [hiker, setHiker] = useState<HikerDraft>(emptyHikerDraft);
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [chosenSlotId, setChosenSlotId] = useState<number | null>(null);
  const [partySize, setPartySize] = useState('2');
  const [requirements, setRequirements] = useState<RequirementDraft[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ summary: string; result: StaffBookingResult } | null>(null);

  const schedule = useSchedule(date);
  // The schedule has only the capacity: the free seats come from the slots that can be booked.
  const upcoming = useBookableSlots();
  const freeSeats = new Map(upcoming.data?.map((s) => [s.id, s.freeSeats]));
  const now = new Date();
  const slots = schedule.data ?? [];
  const bookable = slots.filter((s) => slotNote(s, now, freeSeats.get(s.id)) === '');
  const slot = bookable.find((s) => s.id === chosenSlotId) ?? bookable[0] ?? null;
  const guests = Number(partySize);
  const summary = slot ? `${dateLong(fromIsoDate(date))} · ${slot.startTime}` : null;
  const slotFree = slot ? freeSeats.get(slot.id) : undefined;
  const tooFewSeats =
    slotFree !== undefined && guests > slotFree
      ? `Only ${seats(slotFree)} left in this slot.`
      : null;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const chosenHiker = toHiker(hiker);
    if (!chosenHiker) {
      setErrors({ hikerId: 'Select a hiker, or add a new one with Quick entry or Full profile.' });
      return;
    }
    if (tooFewSeats) {
      setErrors({ slotId: tooFewSeats });
      return;
    }
    if (requirements.some((r) => r.description.trim() === '')) {
      setErrors({ requirements: 'Describe each requirement or remove it.' });
      return;
    }

    const parsed = createStaffBookingSchema.safeParse({
      slotId: slot?.id,
      partySize: guests,
      requirements: toRequirements(requirements),
      hiker: chosenHiker,
    });
    if (!parsed.success) {
      const found: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        // Hiker fields are under "hiker"; a requirement error belongs to the whole list.
        const field = String(issue.path[0] === 'hiker' ? issue.path[1] : issue.path[0]);
        found[field] ??= FIELD_MESSAGES[field] ?? issue.message;
      }
      setErrors(found);
      return;
    }

    const sentSummary = `${summary ?? ''} · ${people(guests)}`;
    createBooking.mutate(parsed.data, {
      onSuccess: (result) => setDone({ summary: sentSummary, result }),
      onError: (err) => setFormError(bookingError(err)),
    });
  }

  return (
    <form className="staff-booking" onSubmit={onSubmit} noValidate>
      <div className="staff-booking__grid">
        <HikerPicker value={hiker} onChange={setHiker} errors={errors} />

        <section className="card" aria-labelledby="reservation-title">
          <h2 id="reservation-title" className="card__title">
            2. Reservation details
          </h2>
          <p className="card__hint">Plan the visit to the hut.</p>

          <FormField
            id="booking-date"
            label="Date *"
            type="date"
            min={toIsoDate(now)}
            value={date}
            onChange={(e) => {
              if (!e.target.value) return;
              setDate(e.target.value);
              setChosenSlotId(null);
            }}
          />

          <div className="field">
            <label htmlFor="booking-slot">Time *</label>
            <select
              id="booking-slot"
              value={slot?.id ?? ''}
              disabled={!schedule.isSuccess || bookable.length === 0}
              aria-invalid={errors.slotId ? true : undefined}
              onChange={(e) => setChosenSlotId(Number(e.target.value))}
            >
              {bookable.length === 0 && <option value="">No time slots</option>}
              {slots.map((s) => {
                const free = freeSeats.get(s.id);
                const note = slotNote(s, now, free);
                return (
                  <option key={s.id} value={s.id} disabled={note !== ''}>
                    {s.startTime}–{s.endTime}
                    {note || (free === undefined ? '' : ` · ${seats(free)}`)}
                  </option>
                );
              })}
            </select>
            {(errors.slotId ?? tooFewSeats) && (
              <p role="alert" className="field-error">
                {errors.slotId ?? tooFewSeats}
              </p>
            )}
          </div>
          <FormField
            id="booking-party"
            label="Number of people *"
            type="number"
            min={1}
            inputMode="numeric"
            value={partySize}
            onChange={(e) => setPartySize(e.target.value)}
            error={errors.partySize}
          />

          {schedule.isPending && <p role="status">Loading the slots of the day…</p>}
          {schedule.isError && (
            <p role="alert" className="notice notice--error">
              {bookingError(schedule.error)}
            </p>
          )}
          {schedule.isSuccess && bookable.length === 0 && (
            <p className="notice notice--ok">No time slots can be booked on this day.</p>
          )}

          <RequirementsEditor value={requirements} onChange={setRequirements} />
          {errors.requirements && (
            <p role="alert" className="field-error">
              {errors.requirements}
            </p>
          )}

          <div className="card__recap">
            {summary && <strong>{summary}</strong>}
            {guests >= 1 && <strong>{people(guests)}</strong>}
            {requirements.some((r) => r.description.trim() !== '') && (
              <ul className="card__requirements" aria-label="Requirements of the party">
                {requirements
                  .filter((r) => r.description.trim() !== '')
                  .map((r) => (
                    <li key={r.key}>
                      {r.allergies && <span className="allergy-badge">Allergies</span>}
                      {r.description}
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <p className="card__hint">* Required fields</p>
        </section>
      </div>

      <div className="action-bar">
        <div className="action-bar__inner">
          <p className="action-bar__text">{FOOTER_TEXT[hiker.mode]}</p>
          <div className="action-bar__buttons">
            <button type="button" className="pill" onClick={() => void navigate('/')}>
              Cancel
            </button>
            <button type="submit" className="pill pill--primary" disabled={createBooking.isPending}>
              {createBooking.isPending ? 'Creating…' : 'Create booking'}
            </button>
          </div>
        </div>
      </div>

      {done && <StaffBookingDoneDialog {...done} onClose={onReset} />}
      {formError && (
        <StaffBookingErrorDialog message={formError} onClose={() => setFormError(null)} />
      )}
    </form>
  );
}

// MH-07: the staff enter a booking for a hiker who reserves by phone or at the hut.
export function StaffBookingPage() {
  const { data: user, isPending } = useCurrentUser();
  // A new key empties the form after each booking.
  const [formKey, setFormKey] = useState(0);

  let content = null;
  if (!isPending) {
    if (!user) {
      content = (
        <p className="notice notice--ok">
          <Link to="/login">Log in</Link> with a staff account to enter a booking.
        </p>
      );
    } else if (!isStaff(user)) {
      content = <p className="notice notice--ok">This page is for the hut staff.</p>;
    } else {
      content = <StaffBookingForm key={formKey} onReset={() => setFormKey((k) => k + 1)} />;
    }
  }

  return (
    <div className="staff-page">
      <header className="staff-hero">
        <div className="staff-hero__inner">
          <p className="staff-hero__breadcrumb">Staff area / Bookings</p>
          <h1 className="staff-hero__title">New booking</h1>
          <p className="staff-hero__subtitle">
            Book a visit on behalf of a hiker. Find an existing profile or add someone new.
          </p>
        </div>
      </header>
      <div className="staff-page__body">{content}</div>
    </div>
  );
}
