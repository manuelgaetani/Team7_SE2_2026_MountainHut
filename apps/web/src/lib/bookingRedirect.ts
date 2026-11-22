// Links that carry a booking from the availability check to the booking page, also through sign
// in and registration (MH-04).

export interface BookingDraft {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM, start of the slot
  partySize: number;
}

// The booking page with the date, the slot and the party size already chosen.
export function bookingPath(draft: BookingDraft): string {
  const params = new URLSearchParams({
    date: draft.date,
    time: draft.time,
    partySize: String(draft.partySize),
  });
  return `/book?${params.toString()}`;
}

// Sign in or registration that, once done, goes on to `next`.
export function authPath(page: '/login' | '/register', next: string | null): string {
  return next ? `${page}?${new URLSearchParams({ next }).toString()}` : page;
}

// Only a path of this app: "https://…" or "//other.site" would send the user to another site.
export function safeNext(value: string | null): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
}

// The booking chosen in the booking page address, if it is complete and valid.
export function draftFromSearch(params: URLSearchParams): BookingDraft | null {
  const date = params.get('date') ?? '';
  const time = params.get('time') ?? '';
  const partySize = Number(params.get('partySize'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  if (!Number.isInteger(partySize) || partySize < 1) return null;
  return { date, time, partySize };
}
