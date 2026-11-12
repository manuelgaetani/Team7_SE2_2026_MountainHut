
export const CHANGE_LEAD_MS = 48 * 60 * 60 * 1000;

// "Changes are admitted within 48 hours from the date booked": read as up to 48 hours before
// the booked slot starts, the boundary included.
export function isChangeAdmitted(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() >= CHANGE_LEAD_MS;

}
