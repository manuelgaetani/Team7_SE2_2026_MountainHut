import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MyBooking } from '@mountain-hut/shared';
import { dateFull, fromIsoDate } from '../lib/dates.ts';
import './CancelBookingDialog.css';

interface CancelBookingDialogProps {
  booking: MyBooking;
  onClose: () => void;
  /** The hiker confirmed: the page cancels, with a toast that can still undo it. */
  onConfirm: () => void;
}

const people = (n: number): string => (n === 1 ? '1 person' : `${n} people`);

// Asks to confirm the cancellation. The page sends it once the Undo toast that follows is gone.
export function CancelBookingDialog({ booking, onClose, onConfirm }: CancelBookingDialogProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The focus goes to the safe button.
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const recap = `${dateFull(fromIsoDate(booking.date))} · ${booking.startTime}–${booking.endTime} · ${people(booking.partySize)}`;

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dialog cancel-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
      >
        <button type="button" className="dialog__close" aria-label="Close" onClick={onClose}>
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

          <div className="cancel-dialog__actions">
            <button
              ref={buttonRef}
              type="button"
              className="cancel-dialog__secondary"
              onClick={onClose}
            >
              Keep booking
            </button>
            <button type="button" className="cancel-dialog__primary" onClick={onConfirm}>
              Cancel booking
            </button>
          </div>
        </>
      </div>
    </div>,
    document.body,
  );
}
