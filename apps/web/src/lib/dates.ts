const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Slot dates are already local to the hut (YYYY-MM-DD): build a local Date without timezone shifts. */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const weekdayShort = (d: Date): string =>
  capitalize(new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(d).replace('.', ''));

export const monthYear = (d: Date): string =>
  capitalize(new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(d));

/** "Sab 14 nov" */
export const dateShort = (d: Date): string =>
  `${weekdayShort(d)} ${d.getDate()} ${new Intl.DateTimeFormat('it-IT', { month: 'short' })
    .format(d)
    .replace('.', '')}`;