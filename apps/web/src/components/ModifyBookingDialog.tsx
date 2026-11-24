import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { MAX_REQUIREMENTS_LENGTH } from '@mountain-hut/shared';
import type {
  ChangeBookingInput,
  MyBooking,
  PartyRequirement,
  SlotSummary,
} from '@mountain-hut/shared';
import { useBookableSlots, useChangeBooking } from '../api/useBookings.ts';
import { CHANGE_LEAD_HOURS, isChangeOpen } from '../lib/bookingChange.ts';
import { apiErrorMessage } from '../lib/errors.ts';
import './ModifyBookingDialog.css';
import { DayPicker } from './DayPicker.tsx';
import { ErrorNotice } from './ErrorNotice.tsx';
import { GuestStepper } from './GuestStepper.tsx';
import { RequirementsEditor, type RequirementDraft } from './RequirementsEditor.tsx';
import { TimeSlotPicker } from './TimeSlotPicker.tsx';
import { useToast } from './Toast.tsx';

interface ModifyBookingDialogProps {
  booking: MyBooking;
  onClose: () => void;
}

const toRows = (list: PartyRequirement[]): RequirementDraft[] =>
  list.map((r, i) => ({ ...r, key: i + 1 }));

// What the rows will be once saved: trimmed descriptions, without the keys.
const toRequirements = (rows: RequirementDraft[]): PartyRequirement[] =>
  rows.map((r) => ({ allergies: r.allergies, description: r.description.trim() }));

const sameRequirements = (a: PartyRequirement[], b: PartyRequirement[]): boolean =>
  a.length === b.length &&
  a.every((r, i) => r.allergies === b[i].allergies && r.description === b[i].description);

export function ModifyBookingDialog({ booking, onClose }: ModifyBookingDialogProps) {
  const slotsQuery = useBookableSlots();
  const change = useChangeBooking();
  const toast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  const [date, setDate] = useState(booking.date);
  const [slotId, setSlotId] = useState<number | null>(booking.slotId);
  const [partySize, setPartySize] = useState(booking.partySize);
  const [rows, setRows] = useState(() => toRows(booking.requirements));
  const [errors, setErrors] = useState<Partial<Record<number, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  // Edits that were reverted to the original values do not count.
  const dirty =
    slotId !== booking.slotId ||
    partySize !== booking.partySize ||
    !sameRequirements(toRequirements(rows), booking.requirements);

  const requestClose = () => {
    if (dirty) setConfirmingDiscard(true);
    else onClose();
  };

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    if (confirmingDiscard) keepRef.current?.focus();
  }, [confirmingDiscard]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmingDiscard) setConfirmingDiscard(false);
      else if (dirty) setConfirmingDiscard(true);
      else onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, dirty, confirmingDiscard]);

  const slots = slotsQuery.data ?? [];
  const dates = [...new Set(slots.map((s) => s.date))].sort((a, b) => a.localeCompare(b));
  const daySlots = slots
    .filter((s) => s.date === date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  // The slot of the booking can always be kept, even when it is full or too close. Another slot
  // must have free seats and start at least 48 hours from now (the API refuses it otherwise).
  const canChoose = (s: SlotSummary): boolean =>
    s.id === booking.slotId ||
    (s.availability === 'AVAILABLE' && isChangeOpen(s.date, s.startTime));
  // Why a slot of the list cannot be chosen; null when it can.
  const reason = (s: SlotSummary): string | null => {
    if (s.id === booking.slotId) return null;
    if (s.availability === 'FULL') return 'Full';
    if (s.availability === 'TOO_LATE') return 'Closed';
    return canChoose(s) ? null : `Within ${CHANGE_LEAD_HOURS} hours`;
  };
  // The seats of the booking go back to its own slot.
  const maxFor = (s: SlotSummary): number =>
    s.freeSeats + (s.id === booking.slotId ? booking.partySize : 0);
  const chosen = slots.find((s) => s.id === slotId);

  function chooseSlot(id: number | null) {
    setSlotId(id);
    const slot = slots.find((s) => s.id === id);
    if (slot) setPartySize((size) => Math.min(size, maxFor(slot)));
    setFormError(null);
  }

  function chooseDate(newDate: string) {
    setDate(newDate);
    const kept = newDate === booking.date ? booking.slotId : null;
    chooseSlot(kept ?? slots.find((s) => s.date === newDate && canChoose(s))?.id ?? null);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found: Partial<Record<number, string>> = {};
    for (const row of rows) {
      const length = row.description.trim().length;
      if (length === 0) found[row.key] = 'Describe the requirement or remove it.';
      if (length > MAX_REQUIREMENTS_LENGTH) {
        found[row.key] = `A requirement can be at most ${MAX_REQUIREMENTS_LENGTH} characters.`;
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
    if (partySize !== booking.partySize) input.partySize = partySize;
    const requirements = toRequirements(rows);
    if (!sameRequirements(requirements, booking.requirements)) input.requirements = requirements;
    if (Object.keys(input).length === 0) {
      setFormError('Nothing has changed: the booking is the same as before.');
      return;
    }

    setFormError(null);
    change.mutate(
      { id: booking.id, input },
      {
        onSuccess: () => {
          toast.show({ message: "Booking updated. We'll email you the new details." });
          onClose();
        },
        onError: (err) =>
          setFormError(
            apiErrorMessage(
              err,
              'The booking could not be changed. Please try again.',
              [403, 404, 409, 422],
            ),
          ),
      },
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
        if (e.target === e.currentTarget) requestClose();
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
        <button type="button" className="dialog__close" aria-label="Close" onClick={requestClose}>
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
            <>
              <DayPicker dates={dates} value={date} onChange={chooseDate} label="Date" />
              <TimeSlotPicker
                slots={daySlots}
                guests={partySize}
                value={slotId}
                onChange={chooseSlot}
                label="Time"
                canChoose={canChoose}
                reason={reason}
              />
            </>
          )}

          <GuestStepper
            value={partySize}
            max={chosen ? maxFor(chosen) : undefined}
            onChange={(size) => {
              setPartySize(size);
              setFormError(null);
            }}
            label="Number of people"
            hint={null}
          />

          <RequirementsEditor
            value={rows}
            errors={errors}
            onChange={(next) => {
              setRows(next);
              setFormError(null);
            }}
          />

          {formError && <ErrorNotice message={formError} />}

          {confirmingDiscard ? (
            <div className="modify-dialog__discard">
              <p className="modify-dialog__discard-title">Discard your changes?</p>
              <div className="modify-dialog__actions">
                <button
                  ref={keepRef}
                  type="button"
                  className="modify-dialog__secondary"
                  onClick={() => setConfirmingDiscard(false)}
                >
                  Keep editing
                </button>
                <button type="button" className="modify-dialog__danger" onClick={onClose}>
                  Discard
                </button>
              </div>
            </div>
          ) : (
            <div className="modify-dialog__actions">
              <button type="button" className="modify-dialog__secondary" onClick={requestClose}>
                Close
              </button>
              <button type="submit" className="modify-dialog__primary" disabled={change.isPending}>
                {change.isPending ? 'Saving changes…' : 'Confirm changes'}
              </button>
            </div>
          )}
        </form>

        <p className="modify-dialog__warning">
          <span aria-hidden="true">!</span>
          Changes are admitted up to {CHANGE_LEAD_HOURS} hours before the booked date, and a new
          time must start at least {CHANGE_LEAD_HOURS} hours from now.
        </p>
      </div>
    </div>,
    document.body,
  );
}
