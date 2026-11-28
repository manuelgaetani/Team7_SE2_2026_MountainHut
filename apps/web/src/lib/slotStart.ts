import { fromIsoDate } from './dates.ts';

/** When a slot of the hut (date YYYY-MM-DD, start HH:MM) starts, in the time of the browser. */
function slotStart(date: string, startTime: string): Date {
  const start = fromIsoDate(date);
  const [hours, minutes] = startTime.split(':').map(Number);
  start.setHours(hours, minutes);
  return start;
}

// MH-10: the menu of a slot can be written, changed or deleted only before the slot starts.
// The API checks the same rule (422 from the start on); here it only spares the staff a request
// that would be refused.
export function isMenuEditable(date: string, startTime: string, now: Date = new Date()): boolean {
  return now.getTime() < slotStart(date, startTime).getTime();
}
