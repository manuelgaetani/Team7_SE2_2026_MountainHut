import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MyBooking } from '@mountain-hut/shared';
import { useCancelBooking } from '../api/useBookings.ts';
import { dateFull, fromIsoDate } from '../lib/dates.ts';
import './CancelBookingDialog.css';
import { apiErrorMessage } from '../lib/errors.ts';
import { ErrorNotice } from './ErrorNotice.tsx';
import { useToast } from './Toast.tsx';

interface CancelBookingDialogProps {
  booking: MyBooking;
  onClose: () => void;
}

const people = (n: number): string => (n === 1 ? '1 person' : `${n} people`);

// Asks to confirm the cancellation; on success a toast says it is done and the dialog closes.
export function CancelBookingDialog({ booking, onClose }: CancelBookingDialogProps) {
  const cancel = useCancelBooking();
  const toast = useToast();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pending = cancel.isPending;
  // While the request is on its way the dialog stays open.
  const close = () => {
    if (!pending) onClose();
  };

  // The focus goes to the safe button.
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

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
            <ErrorNotice
              message={apiErrorMessage(
                cancel.error,
                'The booking could not be cancelled. Please try again.',
                [403, 404, 409],
              )}
              className="cancel-dialog__error"
            />
          )}

          <div className="cancel-dialog__actions">
            <button
              ref={buttonRef}
              type="button"
              className="cancel-dialog__secondary"
              disabled={pending}
              onClick={onClose}
            >
              Keep booking
            </button>
            <button
              type="button"
              className="cancel-dialog__primary"
              disabled={pending}
              onClick={() =>
                cancel.mutate(booking.id, {
                  onSuccess: () => {
                    toast.show({ message: 'Booking cancelled. Seats are free again.' });
                    onClose();
                  },
                })
              }
            >
              {pending ? 'Cancelling…' : 'Cancel booking'}
            </button>
          </div>
        </>
      </div>
    </div>,
    document.body,
  );
}
