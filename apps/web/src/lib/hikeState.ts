import { hikeMoment, type RegisteredHike } from '@mountain-hut/shared';
import { toIsoDate } from './dates.ts';

export type HikeState = 'PLANNED' | 'UNDER_WAY' | 'PAST';

export const HIKE_STATE_LABEL: Record<HikeState, string> = {
  PLANNED: 'Planned',
  UNDER_WAY: 'Under way',
  PAST: 'Past',
};

const pad = (n: number): string => String(n).padStart(2, '0');

// The local date and time of a Date as a hike moment, e.g. "2026-11-26T10:00".
export const nowMoment = (now: Date): string =>
  hikeMoment(toIsoDate(now), `${pad(now.getHours())}:${pad(now.getMinutes())}`);

// A hike has started at its departure (issue #53) and is past once the expected return has come.
export function hikeState(hike: RegisteredHike, now: string): HikeState {
  if (hikeMoment(hike.returnDate, hike.returnTime) <= now) return 'PAST';
  if (hikeMoment(hike.departureDate, hike.departureTime) <= now) return 'UNDER_WAY';
  return 'PLANNED';
}
