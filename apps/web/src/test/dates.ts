import { fireEvent, screen, within } from '@testing-library/react';
import { dateShort, fromIsoDate, monthOf } from '../lib/dates.ts';

/** What a DateField shows for a day: "Thu 5 Nov 2026". */
export const shownDate = (iso: string): string =>
  `${dateShort(fromIsoDate(iso))} ${fromIsoDate(iso).getFullYear()}`;

// The month shown by the open calendar, as YYYY-MM-01.
function shownMonth(): string {
  const title = document.querySelector('.calendar__title')?.textContent ?? '';
  const d = new Date(`1 ${title}`);
  return monthOf(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
}

/** Opens the calendar of the DateField named `label`, goes to the month of `iso` and picks it. */
export function chooseDate(label: string, iso: string): void {
  fireEvent.click(screen.getByLabelText(label));
  const calendar = within(screen.getByRole('group', { name: 'Calendar' }));
  const target = monthOf(iso);
  for (let i = 0; i < 120 && shownMonth() !== target; i++) {
    const name = shownMonth() < target ? 'Next month' : 'Previous month';
    fireEvent.click(calendar.getByRole('button', { name }));
  }
  fireEvent.click(calendar.getByRole('button', { name: dateShort(fromIsoDate(iso)) }));
}
