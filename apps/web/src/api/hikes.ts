import type {
  PredefinedHike,
  RegisterHikeInput,
  RegisteredHike,
  StaffHike,
} from '@mountain-hut/shared';
import { apiGet, apiPost } from './client.ts';

// MH-20: the hut's list of popular hikes, to start the registration from one of them.
export function fetchPredefinedHikes(): Promise<PredefinedHike[]> {
  return apiGet<PredefinedHike[]>('/hikes/predefined');
}

// MH-20: the hikes of the logged-in hiker, the latest departure first.
export function fetchMyHikes(): Promise<RegisteredHike[]> {
  return apiGet<RegisteredHike[]>('/hikes/mine');
}

// MH-20: the hiker comes from the session cookie, never from the body.
export function registerHike(input: RegisterHikeInput): Promise<RegisteredHike> {
  return apiPost<RegisteredHike>('/hikes', input);
}

// MH-20: every registered hike with its hiker, for the hut staff.
export function fetchStaffHikes(): Promise<StaffHike[]> {
  return apiGet<StaffHike[]>('/staff/hikes');
}

// MH-21: the hiker (own hike) or the staff (any hike) confirm the hike has started.
// The endpoint is not in the API yet: until then the call fails and the page says so.
export function checkInHike(id: number): Promise<RegisteredHike> {
  return apiPost<RegisteredHike>(`/hikes/${id}/check-in`);
}
