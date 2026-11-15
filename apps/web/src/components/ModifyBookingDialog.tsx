import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { MAX_REQUIREMENTS_COUNT, MAX_REQUIREMENTS_LENGTH } from '@mountain-hut/shared';
import type { MyBooking, PartyRequirement, SlotSummary } from '@mountain-hut/shared';
import type { ChangeBookingInput } from '../api/bookings.ts';
import { ApiError } from '../api/client.ts';
import { useChangeBooking, useUpcomingSlots } from '../api/useBookings.ts';
import { dateLong, fromIsoDate } from '../lib/dates.ts';
import './ModifyBookingDialog.css';

interface ModifyBookingDialogProps {
  booking: MyBooking;
  onClose: () => void;
  // Called once the API has stored the change.
  onChanged: () => void;
}

function changeError(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) {
    return 'The session has expired. Please log in again.';
  }
  // The API explains these: 48-hour rule, seats, booking or slot not found, not your booking.
  if (e instanceof ApiError && [403, 404, 409, 422].includes(e.status)) return e.message;
  return 'The booking could not be changed. Please try again.';
}

// Errors by field: 'partySize', or 'requirement-<key>' for a row of the requirements.
type Errors = Record<string, string>;

// A requirement as edited in the form. The key only identifies the row in the list.
interface RequirementRow extends PartyRequirement {
  key: number;
}

const toRows = (list: PartyRequirement[]): RequirementRow[] =>
  list.map((r, i) => ({ ...r, key: i + 1 }));

const nextKey = (rows: RequirementRow[]): number =>
  rows.reduce((max, r) => Math.max(max, r.key), 0) + 1;

// What the rows will be once saved: trimmed descriptions, without the keys.
const toRequirements = (rows: RequirementRow[]): PartyRequirement[] =>
  rows.map((r) => ({ allergies: r.allergies, description: r.description.trim() }));

const sameRequirements = (a: PartyRequirement[], b: PartyRequirement[]): boolean =>
  a.length === b.length &&
  a.every((r, i) => r.allergies === b[i].allergies && r.description === b[i].description);

const UNAVAILABLE: Record<SlotSummary['availability'], string> = {
  AVAILABLE: '',
  FULL: ' (full)',
  TOO_LATE: ' (too late)',
};

export function ModifyBookingDialog({ booking, onClose, onChanged }: ModifyBookingDialogProps) {
  const slotsQuery = useUpcomingSlots();
  const change = useChangeBooking();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [date, setDate] = useState(booking.date);
  const [slotId, setSlotId] = useState<number | null>(booking.slotId);
  const [partySize, setPartySize] = useState(String(booking.partySize));
  const [rows, setRows] = useState(() => toRows(booking.requirements));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const slots = slotsQuery.data ?? [];
  const dates = [...new Set(slots.map((s) => s.date))].sort((a, b) => a.localeCompare(b));
  const daySlots = slots
    .filter((s) => s.date === date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  // The slot of the booking can always be kept, even when it is full or too close.
  const canChoose = (s: SlotSummary): boolean =>
    s.id === booking.slotId || s.availability === 'AVAILABLE';

  function chooseDate(newDate: string) {
    setDate(newDate);
    const kept = newDate === booking.date ? booking.slotId : null;
    setSlotId(kept ?? slots.find((s) => s.date === newDate && canChoose(s))?.id ?? null);
    setFormError(null);
  }

  function updateRow(key: number, patch: Partial<PartyRequirement>) {
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setFormError(null);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found: Errors = {};
    const size = Number(partySize);
    if (!Number.isInteger(size) || size < 1) {
      found.partySize = 'Enter a whole number of people, at least 1.';
    }
    for (const row of rows) {
      const length = row.description.trim().length;
      if (length === 0) found[`requirement-${row.key}`] = 'Describe the requirement or remove it.';
      if (length > MAX_REQUIREMENTS_LENGTH) {
        found[`requirement-${row.key}`] =
          `A requirement can be at most ${MAX_REQUIREMENTS_LENGTH} characters.`;
      }
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError(null);
      return;
    }

    if (slotId === null) {
      setFormError('Choose a time.');
      return;
    }

    // Only the details that change are sent.
    const input: ChangeBookingInput = {};
    if (slotId !== booking.slotId) input.slotId = slotId;
    if (size !== booking.partySize) input.partySize = size;
    const requirements = toRequirements(rows);
    if (!sameRequirements(requirements, booking.requirements)) input.requirements = requirements;
    if (Object.keys(input).length === 0) {
      setFormError('Change at least one detail of the booking.');
      return;
    }

    setFormError(null);
    change.mutate(
      { id: booking.id, input },
      { onSuccess: onChanged, onError: (err) => setFormError(changeError(err)) },
    );
  }

  const loaded = slotsQuery.isSuccess;
  let slotStatus = null;
  if (slotsQuery.isPending) slotStatus = <p role="status">Loading time slots…</p>;
  if (slotsQuery.isError) {
    slotStatus = (
      <p role="alert" className="notice notice--error">
        Time slots could not be loaded. Please try again.
      </p>
    );
  }

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="dialog modify-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modify-dialog-title"
      >
        <button type="button" className="dialog__close" aria-label="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>

        <p className="modify-dialog__eyebrow">Your reservation</p>
        <h2 id="modify-dialog-title" className="dialog__title">
          Modify booking
        </h2>
        <p className="modify-dialog__subtitle">Update the details of your visit to the hut.</p>

        <form noValidate onSubmit={handleSubmit} className="modify-dialog__form">
          {slotStatus}

          {loaded && (
            <div className="field">
              <label htmlFor="modify-date">Date</label>
              <select id="modify-date" value={date} onChange={(e) => chooseDate(e.target.value)}>
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {dateLong(fromIsoDate(d))}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="modify-dialog__row">
            {loaded && (
              <div className="field">
                <label htmlFor="modify-time">Time</label>
                <select
                  id="modify-time"
                  value={slotId ?? ''}
                  onChange={(e) => {
                    setSlotId(Number(e.target.value));
                    setFormError(null);
                  }}
                >
                  {slotId === null && <option value="">No time available</option>}
                  {daySlots.map((s) => (
                    <option key={s.id} value={s.id} disabled={!canChoose(s)}>
                      {s.startTime}
                      {s.id === booking.slotId ? '' : UNAVAILABLE[s.availability]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="field">
              <label htmlFor="modify-party">Number of people</label>
              <input
                id="modify-party"
                type="number"
                min={1}
                inputMode="numeric"
                value={partySize}
                aria-invalid={errors.partySize ? true : undefined}
                onChange={(e) => setPartySize(e.target.value)}
              />
              {errors.partySize && (
                <p role="alert" className="field-error">
                  {errors.partySize}
                </p>
              )}
            </div>
          </div>

          <fieldset className="modify-dialog__requirements">
            <legend>Dietary requirements</legend>
            <p className="modify-dialog__hint">
              One entry for each person or group with the same needs. Tick “Allergies” when the
              kitchen must take special care.
            </p>

            {rows.map((row, index) => {
              const n = index + 1;
              const id = `requirement-${row.key}`;
              const error = errors[id];
              return (
                <div key={row.key} className="requirement-row">
                  <div className="requirement-row__fields">
                    <input
                      id={id}
                      type="text"
                      aria-label={`Requirement ${n}`}
                      placeholder="e.g. 2 vegetarians"
                      value={row.description}
                      aria-invalid={error ? true : undefined}
                      onChange={(e) => updateRow(row.key, { description: e.target.value })}
                    />
                    <label className="requirement-row__allergies">
                      <input
                        type="checkbox"
                        aria-label={`Allergies, requirement ${n}`}
                        checked={row.allergies}
                        onChange={(e) => updateRow(row.key, { allergies: e.target.checked })}
                      />
                      Allergies
                    </label>
                    <button
                      type="button"
                      className="requirement-row__remove"
                      aria-label={`Remove requirement ${n}`}
                      onClick={() => {
                        setRows(rows.filter((r) => r.key !== row.key));
                        setFormError(null);
                      }}
                    >
                      ×
                    </button>
                  </div>
                  {error && (
                    <p role="alert" className="field-error">
                      {error}
                    </p>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              className="modify-dialog__add"
              disabled={rows.length >= MAX_REQUIREMENTS_COUNT}
              onClick={() => {
                setRows([...rows, { key: nextKey(rows), allergies: false, description: '' }]);
                setFormError(null);
              }}
            >
              + Add a requirement
            </button>
          </fieldset>

          {formError && (
            <p role="alert" className="notice notice--error">
              {formError}
            </p>
          )}

          <div className="modify-dialog__actions">
            <button type="button" className="modify-dialog__secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modify-dialog__primary" disabled={change.isPending}>
              {change.isPending ? 'Saving changes…' : 'Confirm changes'}
            </button>
          </div>
        </form>

        <p className="modify-dialog__warning">
          <span aria-hidden="true">!</span>
          Changes are admitted up to 48 hours before the booked date.
        </p>
      </div>
    </div>,
    document.body,
  );
}
