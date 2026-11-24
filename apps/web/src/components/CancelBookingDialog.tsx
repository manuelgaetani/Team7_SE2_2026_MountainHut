import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MyBooking } from '@mountain-hut/shared';
import { ApiError } from '../api/client.ts';
import { useCancelBooking } from '../api/useBookings.ts';
import { dateFull, fromIsoDate } from '../lib/dates.ts';
import './CancelBookingDialog.css';

interface CancelBookingDialogProps {
  booking: MyBooking;
  onClose: () => void;
}

function cancelError(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) {
    return 'The session has expired. Please log in again.';
  }
  // The API explains these: not a hiker, booking not found, already cancelled or rejected.
  if (e instanceof ApiError && [403, 404, 409].includes(e.status)) return e.message;
  return 'The booking could not be cancelled. Please try again.';
}

const people = (n: number): string => (n === 1 ? '1 person' : `${n} people`);

// First asks to confirm the cancellation, then says that the booking has been cancelled.
export function CancelBookingDialog({ booking, onClose }: CancelBookingDialogProps) {
  const cancel = useCancelBooking();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const done = cancel.isSuccess;
  const pending = cancel.isPending;
  // While the request is on its way the dialog stays open.
  const close = () => {
    if (!pending) onClose();
  };

  // The focus goes to the safe button: "Go back" first, then "OK".
  useEffect(() => {
    buttonRef.current?.focus();
  }, [done]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, pending]);

  const recap = `${dateFull(fromIsoDate(booking.date))} · ${booking.startTime}–${booking.endTime} · ${people(booking.partySize)}`;

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="dialog cancel-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
      >
        <button type="button" className="dialog__close" aria-label="Close" onClick={close}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>

        {done ? (
          <>
            <p className="dialog__status">
              <span className="dialog__icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m5 12 5 5 9-10" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </span>
              Cancelled
            </p>
            <h2 id="cancel-dialog-title" className="dialog__title">
              Booking cancelled
            </h2>
            <p role="status" className="dialog__text">
              Your booking has been cancelled and its seats are free again. You can find it among
              the cancelled bookings.
            </p>
            <div className="dialog__request">
              <span>Cancelled booking</span>
              <strong>{recap}</strong>
            </div>
            <button ref={buttonRef} type="button" className="cta cta--center" onClick={onClose}>
              OK
            </button>
          </>
        ) : (
          <>
            <p className="cancel-dialog__eyebrow">Your reservation</p>
            <h2 id="cancel-dialog-title" className="dialog__title">
              Cancel booking
            </h2>
            <p className="dialog__text">Are you sure you want to cancel the following booking?</p>
            <div className="dialog__request">
              <span>Your booking</span>
              <strong>{recap}</strong>
            </div>

            {cancel.isError && (
              <p role="alert" className="notice notice--error cancel-dialog__error">
                {cancelError(cancel.error)}
              </p>
            )}

            <div className="cancel-dialog__actions">
              <button
                ref={buttonRef}
                type="button"
                className="cancel-dialog__secondary"
                disabled={pending}
                onClick={onClose}
              >
                Go back
              </button>
              <button
                type="button"
                className="cancel-dialog__primary"
                disabled={pending}
                onClick={() => cancel.mutate(booking.id)}
              >
                {pending ? 'Cancelling…' : 'Confirm'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
