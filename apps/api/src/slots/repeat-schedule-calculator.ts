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

// TODO(MH-09): stub. Implement the logic tested in repeat-schedule-calculator.spec.ts, then remove describe.skip there.
export const projectWeeklySchedule: (
  sourceSlots: SourceSlotDefinition[],
  repeatWeeks: number,
) => ProjectedSlot[] = () => {
  throw new Error('Not implemented');
};

