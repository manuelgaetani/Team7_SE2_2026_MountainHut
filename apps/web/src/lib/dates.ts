const LOCALE = 'en-GB';

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Slot dates are already local to the hut (YYYY-MM-DD): build a local Date without timezone shifts. */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const weekdayShort = (d: Date): string =>
  capitalize(new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }).format(d).replace('.', ''));

export const monthYear = (d: Date): string =>
  capitalize(new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }).format(d));

/** "Wed 4 Nov" */
export const dateShort = (d: Date): string =>
  `${weekdayShort(d)} ${d.getDate()} ${new Intl.DateTimeFormat(LOCALE, { month: 'short' })
    .format(d)
    .replace('.', '')}`;