import type {
  BookingResult,
  CreateBookingInput,
  MyBooking,
  PartyRequirement,
  SlotSummary,
} from '@mountain-hut/shared';
import { apiGet, apiPatch, apiPost } from './client.ts';

export const fetchSlots = () => apiGet<SlotSummary[]>('/slots');

export const createBooking = (input: CreateBookingInput) =>
  apiPost<BookingResult>('/bookings', input);

// Upcoming bookings of the logged hiker, the soonest first.
export const fetchMyBookings = () => apiGet<MyBooking[]>('/bookings/me');

// Body of PATCH /api/bookings/:id: only the details that change.
// TODO(MH-06): use ChangeBookingInput of @mountain-hut/shared once the API takes the
// requirements in the MH-05 format (today it still takes one text).
export interface ChangeBookingInput {
  slotId?: number;
  partySize?: number;
  requirements?: PartyRequirement[];
}

export const changeBooking = (id: number, input: ChangeBookingInput) =>
  apiPatch<BookingResult>(`/bookings/${id}`, input);
