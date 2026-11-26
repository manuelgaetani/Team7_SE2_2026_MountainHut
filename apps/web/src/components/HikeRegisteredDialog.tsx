import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { RegisteredHike } from '@mountain-hut/shared';
import { dateFull, fromIsoDate } from '../lib/dates.ts';

interface HikeRegisteredDialogProps {
  hike: RegisteredHike;
  onClose: () => void;
}

const moment = (date: string, time: string): string => `${dateFull(fromIsoDate(date))}, ${time}`;

// MH-20: the outcome must be read (what the hut does with the hike), so it is a dialog.
export function HikeRegisteredDialog({ hike, onClose }: HikeRegisteredDialogProps) {
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
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="hike-dialog-title">
        <button type="button" className="dialog__close" aria-label="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>

        <p className="dialog__status">
          <span className="dialog__icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 20 10 7l4 6 2-3 5 10H3Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          Hike registered
        </p>

        <h2 id="hike-dialog-title" className="dialog__title">
          Have a good hike
        </h2>
        <p className="dialog__text">
          The hut now knows where you are going.{' '}
          <strong>If you are not back by the expected return,</strong> the staff will use these
          details to look for you.
        </p>

        <div className="dialog__request">
          <span>Your hike</span>
          <strong>{hike.destination}</strong>
          <span>{hike.route}</span>
          {hike.passagePoints.length > 0 && <span>Via {hike.passagePoints.join(' → ')}</span>}
        </div>
        <div className="dialog__request">
          <span>Departure</span>
          <strong>{moment(hike.departureDate, hike.departureTime)}</strong>
          <span>Expected return</span>
          <strong>{moment(hike.returnDate, hike.returnTime)}</strong>
        </div>

        <button ref={buttonRef} type="button" className="cta cta--center" onClick={onClose}>
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}
