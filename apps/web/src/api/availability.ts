import type { AvailabilityResult, CheckAvailabilityQuery } from '@mountain-hut/shared';
import { apiGet } from './client.ts';

// Public: no session needed.
export function fetchAvailability(query: CheckAvailabilityQuery): Promise<AvailabilityResult> {
  const params = new URLSearchParams({
    date: query.date,
    time: query.time,
    partySize: String(query.partySize),
  });
  return apiGet<AvailabilityResult>(`/availability?${params.toString()}`);
}
