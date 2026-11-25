import { useEffect, useId } from 'react';
import type { SlotDetails } from '../api/slots.ts';
import { dateShort, fromIsoDate } from '../lib/dates.ts';
import { MenuDialog } from './MenuDialog.tsx';
import { SlotMenuCard } from './SlotMenuCard.tsx';

interface MenuPreviewDialogProps {
  slot: SlotDetails;
  onClose: () => void;
}

// MH-10: the staff see the menu of a slot exactly as hikers see it on Book a table.
export function MenuPreviewDialog({ slot, onClose }: MenuPreviewDialogProps) {
  const titleId = useId();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <MenuDialog onClose={onClose} labelledBy={titleId} className="menu-preview">
      <p className="modify-dialog__eyebrow">As hikers see it</p>
      <h2 id={titleId} className="dialog__title">
        {slot.startTime}–{slot.endTime}, {dateShort(fromIsoDate(slot.date))}
      </h2>
      <SlotMenuCard slotId={slot.id} time={`${slot.startTime}–${slot.endTime}`} />
      <div className="modify-dialog__actions menu-dialog__actions--single">
        <button type="button" className="modify-dialog__secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </MenuDialog>
  );
}
