import type { PredefinedHike, RegisterHikeInput, RegisteredHike } from '@mountain-hut/shared';
import { apiGet, apiPost } from './client.ts';

// MH-20: the hut's list of popular hikes, to start the registration from one of them.
export function fetchPredefinedHikes(): Promise<PredefinedHike[]> {
  return apiGet<PredefinedHike[]>('/hikes/predefined');
}

// MH-20: the hiker comes from the session cookie, never from the body.
export function registerHike(input: RegisterHikeInput): Promise<RegisteredHike> {
  return apiPost<RegisteredHike>('/hikes', input);
}
