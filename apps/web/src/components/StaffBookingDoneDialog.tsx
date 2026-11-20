import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { StaffBookingResult } from '@mountain-hut/shared';

interface StaffBookingDoneDialogProps {
  summary: string;
  result: StaffBookingResult;
  onClose: () => void;
}

const STATUS_LABEL: Record<StaffBookingResult['status'], string> = {
  CONFIRMED: 'Booking confirmed',
  PENDING: 'Awaiting confirmation',
  REJECTED: 'Booking rejected',
};

// MH-07: the outcome of a booking entered by the staff. When a regular hiker was created, it
// shows the generated password once, so the staff can tell it to the hiker.
export function StaffBookingDoneDialog({ summary, result, onClose }: StaffBookingDoneDialogProps) {
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

  const tables = result.tables.map((t) => `Table ${t.tableNumber}`).join(', ');

  return createPortal(
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="staff-done-title">
        <p className="dialog__status">{STATUS_LABEL[result.status]}</p>

        <h2 id="staff-done-title" className="dialog__title">
          Booking created
        </h2>

        <div className="dialog__request">
          <span>{result.hiker.fullName}</span>
          <strong>{summary}</strong>
          {tables && <span>{tables}</span>}
        </div>

        {result.generatedPassword && (
          <div className="dialog__request">
            <span>Temporary password</span>
            <strong>
              <code>{result.generatedPassword}</code>
            </strong>
            <span>
              Tell it to the hiker now: it is not shown again. They will have to change it at their
              next login, and they can always recover it by email.
            </span>
          </div>
        )}

        <button ref={buttonRef} type="button" className="cta cta--center" onClick={onClose}>
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}
