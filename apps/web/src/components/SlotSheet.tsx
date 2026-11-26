import { useEffect, useRef, type ReactNode } from 'react';
import './ModifyBookingDialog.css';

interface SlotSheetProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  // The id of the heading of the form inside, which names the dialog.
  labelledBy: string;
  children: ReactNode;
}

// On narrow screens the side panel of Time slots (new slot, define tables) is a dialog opened
// from a bar at the bottom of the screen. The form stays mounted while the dialog is closed,
// so what was typed is still there when it opens again.
export function SlotSheet({ open, onOpen, onClose, labelledBy, children }: SlotSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const opener = openerRef.current;
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus();
    };
  }, [open, onClose]);

  return (
    <>
      <div className="slot-sheet__bar">
        <button
          ref={openerRef}
          type="button"
          className="cta cta--center slot-sheet__open"
          aria-haspopup="dialog"
          onClick={onOpen}
        >
          Create slots
        </button>
      </div>
      <div
        // Closed, it is not a .dialog-backdrop: that class also stops the page from scrolling.
        className={open ? 'dialog-backdrop slot-sheet' : 'slot-sheet'}
        role="presentation"
        hidden={!open}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="dialog modify-dialog slot-sheet__dialog"
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
      </div>
    </>
  );
}
