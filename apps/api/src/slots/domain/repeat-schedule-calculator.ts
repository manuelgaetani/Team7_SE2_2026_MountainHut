export interface SourceSlotDefinition {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  tables: { tableNumber: number; seats: number }[];
}

export interface ProjectedSlot {
  date: string;
  startTime: string;
  endTime: string;
  tables: { tableNumber: number; seats: number }[];
  targetWeekIndex: number;
}

const DAY_MS = 86_400_000;

// A calendar date moved by a number of days. Dates are handled at UTC midnight, so daylight
// saving time never shifts them.
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// MH-09: each source slot copied into each of the next repeatWeeks weeks, on the same weekday,
// with the same times and a copy of its tables. Week by week, in the order of the source slots.
export function projectWeeklySchedule(
  sourceSlots: SourceSlotDefinition[],
  repeatWeeks: number,
): ProjectedSlot[] {
  if (!Number.isInteger(repeatWeeks) || repeatWeeks < 1) {
    throw new RangeError('repeatWeeks must be a positive integer');
  }
  const projected: ProjectedSlot[] = [];
  for (let week = 1; week <= repeatWeeks; week++) {
    for (const slot of sourceSlots) {
      projected.push({
        date: addDays(slot.date, 7 * week),
        startTime: slot.startTime,
        endTime: slot.endTime,
        tables: slot.tables.map((t) => ({ ...t })),
        targetWeekIndex: week,
      });
    }
  }
  return projected;
}
