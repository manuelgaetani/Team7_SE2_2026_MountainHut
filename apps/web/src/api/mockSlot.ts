import type { SlotSummary } from '@mountain-hut/shared';

const isoDay = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const TIMES = [
  ['12:00', '13:00'],
  ['12:30', '13:30'],
  ['13:00', '14:00'],
  ['13:30', '14:30'],
];

export const mockSlots: SlotSummary[] = [1, 2, 3, 4, 5].flatMap((day, i) =>
  TIMES.map(
    ([startTime, endTime], j): SlotSummary => ({
      id: i * 10 + j + 1,
      date: isoDay(day),
      startTime,
      endTime,
      freeSeats: j === 3 ? 0 : 20 - j * 6,
      availability: j === 3 ? 'FULL' : 'AVAILABLE',
    }),
  ),
);