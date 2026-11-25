import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './ModifyBookingDialog.css';
import './Menu.css';

interface MenuDialogProps {
  onClose: () => void;
  // The id of the heading that names the dialog.
  labelledBy: string;
  className?: string;
  children: ReactNode;
}

// A dialog in the style of "Modify booking": the backdrop and the × ask to close, the focus goes
// into the dialog and back to the button that opened it. Escape is left to the content, which
// may have a question to answer first.
export function MenuDialog({ onClose, labelledBy, className = '', children }: MenuDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => opener?.focus();
  }, []);
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
        className={`dialog modify-dialog menu-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <button type="button" className="dialog__close" aria-label="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
