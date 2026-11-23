import type { HikerProfile } from '@mountain-hut/shared';
import { apiGet } from './client.ts';

// The profile of the logged-in hiker: name, email and phone shown next to the bookings.
export function fetchMyProfile(): Promise<HikerProfile> {
  return apiGet<HikerProfile>('/hikers/me');
}
