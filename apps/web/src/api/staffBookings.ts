import type {
  CreateStaffBookingInput,
  HikerProfile,
  StaffBookingResult,
} from '@mountain-hut/shared';
import { apiGet, apiPost } from './client.ts';

// MH-07: hikers matching a name, phone or email.
export function searchHikers(search: string): Promise<HikerProfile[]> {
  const query = new URLSearchParams({ search }).toString();
  return apiGet<HikerProfile[]>(`/hikers?${query}`);
}

// MH-07: a booking entered by the staff for an existing, temporary or new regular hiker.
export function createStaffBooking(input: CreateStaffBookingInput): Promise<StaffBookingResult> {
  return apiPost<StaffBookingResult>('/staff/bookings', input);
}
