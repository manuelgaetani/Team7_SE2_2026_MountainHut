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
// It is the same as ChangeBookingInput of @mountain-hut/shared in feature/MH-06-change-a-booking
// (the requirements as a list, [] to remove them all).
export interface ChangeBookingInput {
  slotId?: number;
  partySize?: number;
  requirements?: PartyRequirement[];
}

export const changeBooking = (id: number, input: ChangeBookingInput) =>
  apiPatch<BookingResult>(`/bookings/${id}`, input);
