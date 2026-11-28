import type { LocalMoment } from './hike.js';

// The local date and time of the hut at the given instant, to the minute: 'YYYY-MM-DDTHH:MM'.
export function localMoment(now: Date, timeZone: string): LocalMoment {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export type HikeRegistrationDecision = { ok: true } | { ok: false; reason: 'DEPARTURE_PASSED' };

// The story says "before departure": a hike can be registered only while its departure is still
// ahead. A departure in the current minute has already come.
export function decideHikeRegistration(
  departureAt: LocalMoment,
  now: LocalMoment,
): HikeRegistrationDecision {
  return departureAt > now ? { ok: true } : { ok: false, reason: 'DEPARTURE_PASSED' };
}
