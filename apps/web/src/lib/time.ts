const pad = (n: number): string => String(n).padStart(2, '0');

// A time typed by hand made into HH:MM: "930" → "09:30", "19.5" → "19:05", "7" → "07:00".
// What cannot be read as a time of the day is given back as typed, for the form to reject.
export function normalizeTime(raw: string): string {
  const text = raw.trim();
  let hours: number;
  let minutes: number;
  if (/^\d{3,4}$/.test(text)) {
    // Digits only: the last two are the minutes.
    hours = Number(text.slice(0, -2));
    minutes = Number(text.slice(-2));
  } else {
    const parts = /^(\d{1,2})(?:[:.h ](\d{1,2}))?$/.exec(text);
    if (!parts) return text;
    hours = Number(parts[1]);
    minutes = Number(parts[2] ?? 0);
  }
  if (hours > 23 || minutes > 59) return text;
  return `${pad(hours)}:${pad(minutes)}`;
}

// The hour and the minute of an HH:MM time; null for both when it is not one.
export function splitTime(time: string): { hour: number | null; minute: number | null } {
  const parts = /^(\d{2}):(\d{2})$/.exec(time);
  return parts
    ? { hour: Number(parts[1]), minute: Number(parts[2]) }
    : { hour: null, minute: null };
}

export const joinTime = (hour: number, minute: number): string => `${pad(hour)}:${pad(minute)}`;
