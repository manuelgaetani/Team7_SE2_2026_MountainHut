import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { SlotSummary } from '@mountain-hut/shared';
import './Popover.css';
import './TimeList.css';

interface TimeListProps {
  id?: string;
  slots: SlotSummary[];
  /** The chosen slot, shown filled; null when none is chosen yet. */
  value: number | null;
  canChoose: (slot: SlotSummary) => boolean;
  /** Why a slot cannot be chosen (e.g. "Full"), shown under its time. */
  reason: (slot: SlotSummary) => string | null;
  hint?: string;
  onPick: (slotId: number) => void;
  /** Escape: the caller closes the list and moves the focus back. */
  onClose: () => void;
}

// The times of the day in a floating panel, as the calendar is for the days. The arrows move
// between the times that can be chosen, Home and End to the first and last, Enter or Space picks.
export function TimeList({
  id,
  slots,
  value,
  canChoose,
  reason,
  hint,
  onPick,
  onClose,
}: TimeListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));

  const enabled = (): HTMLButtonElement[] => [
    ...(listRef.current?.querySelectorAll<HTMLButtonElement>('.time-list__slot:not(:disabled)') ??
      []),
  ];

  // On opening, the focus goes to the chosen time, or to the first time that can be chosen.
  useEffect(() => {
    const list = listRef.current;
    const target =
      list?.querySelector<HTMLButtonElement>('[aria-pressed="true"]:not(:disabled)') ??
      list?.querySelector<HTMLButtonElement>('.time-list__slot:not(:disabled)');
    target?.focus();
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      // Only the list closes: a dialog around it stays open.
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      onClose();
      return;
    }
    const buttons = enabled();
    const at = buttons.indexOf(e.target as HTMLButtonElement);
    if (at === -1 || buttons.length === 0) return;
    const last = buttons.length - 1;
    const moves: Record<string, number> = {
      ArrowLeft: Math.max(at - 1, 0),
      ArrowUp: Math.max(at - 1, 0),
      ArrowRight: Math.min(at + 1, last),
      ArrowDown: Math.min(at + 1, last),
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      buttons[moves[e.key]].focus();
    }
  }

  return (
    <div
      id={id}
      className="popover time-list"
      role="group"
      aria-label="Times"
      onKeyDown={onKeyDown}
    >
      <div className="time-list__grid" ref={listRef}>
        {sorted.map((slot) => {
          const why = reason(slot);
          const time = `${slot.startTime}–${slot.endTime}`;
          return (
            <button
              key={slot.id}
              type="button"
              className="time-list__slot"
              aria-label={why ? `${time}, ${why}` : time}
              aria-pressed={slot.id === value}
              disabled={!canChoose(slot)}
              onClick={() => onPick(slot.id)}
            >
              <span className="time-list__time">{time}</span>
              {why && <span className="time-list__reason">{why}</span>}
            </button>
          );
        })}
      </div>
      {hint && <p className="popover__hint">{hint}</p>}
    </div>
  );
}
