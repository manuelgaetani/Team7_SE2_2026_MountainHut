// How full a table of a slot is: it gives the colour of the table in the staff schedule.
export type TableFill = 'free' | 'partial' | 'full';

export function tableFill(capacity: number, occupiedSeats: number): TableFill {
  if (occupiedSeats <= 0) return 'free';
  if (occupiedSeats >= capacity) return 'full';
  return 'partial';
}

// The seats taken out of all the seats of a slot: "6 tables · 22/24 seats taken". One seat
// taken reads "1/24 seat taken".
export const takenLabel = (taken: number, seats: number): string =>
  `${taken}/${seats} ${taken === 1 ? 'seat' : 'seats'} taken`;

// Said by screen readers, so the fill never depends on colour alone.
export const FILL_LABELS: Record<TableFill, string> = {
  free: 'free',
  partial: 'partly taken',
  full: 'full',
};

// The legend above the schedule: what each colour means.
export const LEGEND_LABELS: Record<TableFill, string> = {
  free: 'Free',
  partial: 'Partly taken',
  full: 'Full',
};
