import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface BookingSentDialogProps {
  summary: string;
  onClose: () => void;
}

export function BookingSentDialog({ summary, onClose }: BookingSentDialogProps) {
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
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <button type="button" className="dialog__close" aria-label="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>

        <p className="dialog__status">
          <span className="dialog__icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="3.5"
                y="5.5"
                width="17"
                height="13"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </span>
          Awaiting confirmation
        </p>

        <h2 id="dialog-title" className="dialog__title">
          Booking request sent
        </h2>
        <p className="dialog__text">
          We have received your request. <strong>The booking is not confirmed yet:</strong> wait for
          the hut&apos;s confirmation email to be sure your table is reserved.
        </p>

        <div className="dialog__request">
          <span>Your request</span>
          <strong>{summary}</strong>
        </div>

        <button ref={buttonRef} type="button" className="cta cta--center" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}
