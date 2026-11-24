import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ErrorNotice } from './ErrorNotice.tsx';

interface StaffBookingErrorDialogProps {
  message: string;
  onClose: () => void;
}

// MH-07: why the API refused a booking entered by the staff (email already registered, slot
// full or started, session expired). The form keeps what was typed, so it can be fixed and sent again.
export function StaffBookingErrorDialog({ message, onClose }: StaffBookingErrorDialogProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  return createPortal(
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog dialog--staff"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="staff-error-title"
        aria-describedby="staff-error-message"
      >
        <p className="dialog__status dialog__status--error">Booking not created</p>
        <h2 id="staff-error-title" className="dialog__title">
          Something to fix
        </h2>
        <div id="staff-error-message">
          <ErrorNotice message={message} className="dialog__text" />
        </div>
        <button ref={buttonRef} type="button" className="cta cta--center" onClick={onClose}>
          OK
        </button>
      </div>
    </div>,
    document.body,
  );
}
