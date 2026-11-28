import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ModifyBookingDialog.css';
import './ConfirmDialog.css';

interface ConfirmDialogProps {
  title: string;
  text: string;
  // The safe answer, first and focused: "Keep dish".
  keepLabel: string;
  // The destructive answer: "Remove dish".
  confirmLabel: string;
  onKeep: () => void;
  onConfirm: () => void;
}

// Asks to confirm a destructive action above everything else, also above another dialog: the rest
// of the page gets darker and cannot be used until the question is answered. Escape, the × and a
// click on the backdrop keep things as they are.
export function ConfirmDialog({
  title,
  text,
  keepLabel,
  confirmLabel,
  onKeep,
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = useId();
  const textId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  // Everything outside the question stops working (mouse, keyboard and screen readers) until it
  // is answered; then the focus goes back to where it was or, when that is gone (the removed dish
  // and its button), to the dialog it was in.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const openerDialog = opener?.closest<HTMLElement>('[role="dialog"]');
    const others = Array.from(document.body.children).filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement && el !== backdropRef.current && !el.inert,
    );
    others.forEach((el) => (el.inert = true));
    keepRef.current?.focus();
    return () => {
      others.forEach((el) => (el.inert = false));
      if (opener?.isConnected) opener.focus();
      else if (openerDialog?.isConnected) openerDialog.focus();
    };
  }, []);

  // Escape answers this question only: the dialog below does not see it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onKeep();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onKeep]);

  return createPortal(
    <div
      ref={backdropRef}
      className="dialog-backdrop confirm-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onKeep();
      }}
    >
      <div
        className="dialog confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
      >
        <button type="button" className="dialog__close" aria-label="Close" onClick={onKeep}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        <p id={textId} className="dialog__text">
          {text}
        </p>
        <div className="confirm-dialog__actions">
          <button ref={keepRef} type="button" className="modify-dialog__secondary" onClick={onKeep}>
            {keepLabel}
          </button>
          <button type="button" className="modify-dialog__danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
