import { otherSlotsLabel, seatsTakenLabel } from '../lib/floorLabels.ts';
import type { FloorMoment } from '../lib/floorMoments.ts';

interface FloorMomentPickerProps {
  moments: FloorMoment[];
  current: number;
  onPick: (index: number) => void;
}

// The moments of a slot that shares its tables with overlapping slots. Each button says
// with which slot the tables are shared and how many seats are taken in that moment.
export function FloorMomentPicker({ moments, current, onPick }: FloorMomentPickerProps) {
  return (
    <div className="floor-moments" role="group" aria-label="Moments of the slot">
      {moments.map((moment, i) => (
        <button
          key={moment.startTime}
          type="button"
          className={`floor-moment${i === current ? ' floor-moment--current' : ''}`}
          aria-pressed={i === current}
          onClick={() => onPick(i)}
        >
          <span className="floor-moment__time">
            {moment.startTime}–{moment.endTime} ·{' '}
            {seatsTakenLabel(moment.occupiedSeats, moment.capacity)}
          </span>
          <span className="floor-moment__with">
            {moment.otherSlots.length > 0
              ? `Shared with ${otherSlotsLabel(moment.otherSlots)}`
              : 'Not shared with other slots'}
          </span>
        </button>
      ))}
    </div>
  );
}
