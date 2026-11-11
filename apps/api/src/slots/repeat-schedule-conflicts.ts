import type { ProjectedSlot } from './repeat-schedule-calculator.js';

export type ConflictStrategy = 'SKIP' | 'FAIL';

export interface SlotTimeKey {
  date: string;
  startTime: string;
  endTime: string;
}

export interface ConflictResolutionResult {
  slotsToCreate: ProjectedSlot[];
  skippedSlots: ProjectedSlot[];
  hasConflict: boolean;
}

// TODO(MH-09): stub. Implement the logic tested in repeat-schedule-conflicts.spec.ts, then remove describe.skip there.
export const resolveScheduleConflicts: (
  projected: ProjectedSlot[],
  existing: SlotTimeKey[],
  strategy: ConflictStrategy,
) => ConflictResolutionResult = () => {
  throw new Error('Not implemented');
};

