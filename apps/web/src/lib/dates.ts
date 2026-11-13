const LOCALE = 'en-GB';

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Slot dates are already local to the hut (YYYY-MM-DD): build a local Date without timezone shifts. */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The local calendar date of a Date as YYYY-MM-DD, the format of slot dates. */
export function toIsoDate(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

/** "Sunday 15 November" */
export const dateLong = (d: Date): string =>
  `${new Intl.DateTimeFormat(LOCALE, { weekday: 'long' }).format(d)} ${d.getDate()} ${new Intl.DateTimeFormat(
    LOCALE,
    { month: 'long' },
  ).format(d)}`;

/** True for a real calendar date written as YYYY-MM-DD (so not "2026-02-31"). */
export function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    toIsoDate(fromIsoDate(value)) === value
  );
}
