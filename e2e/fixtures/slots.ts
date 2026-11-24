// Slot radios are named "start–end" (plus a reason when closed or full): match by start time.
export const SLOT = (startTime: string): RegExp => new RegExp(`^${startTime}–`);
