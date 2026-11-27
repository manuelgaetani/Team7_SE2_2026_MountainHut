import { hikeMoment, type RegisteredHike } from '@mountain-hut/shared';
import { toIsoDate } from './dates.ts';

export type HikeState = 'PLANNED' | 'UNDER_WAY' | 'NO_CHECK_IN' | 'PAST';

export const HIKE_STATE_LABEL: Record<HikeState, string> = {
  PLANNED: 'Planned',
  UNDER_WAY: 'Under way',
  NO_CHECK_IN: 'No check-in',
  PAST: 'Past',
};

const pad = (n: number): string => String(n).padStart(2, '0');

// The local date and time of a Date as a hike moment, e.g. "2026-11-26T10:00".
export const nowMoment = (now: Date): string =>
  hikeMoment(toIsoDate(now), `${pad(now.getHours())}:${pad(now.getMinutes())}`);

// A hike has started at its departure (issue #53) and is past once the expected return has come.
// MH-21: a started hike is under way only once the hiker or the staff checked in; until then it
// is flagged, so the staff can call the hiker.
export function hikeState(hike: RegisteredHike, now: string): HikeState {
  if (hikeMoment(hike.returnDate, hike.returnTime) <= now) return 'PAST';
  if (hikeMoment(hike.departureDate, hike.departureTime) <= now) {
    return hike.checkedInAt ? 'UNDER_WAY' : 'NO_CHECK_IN';
  }
  return 'PLANNED';
}
