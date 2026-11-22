import type {
  BookingResult,
  CancelledBooking,
  ChangeBookingInput,
  CreateBookingInput,
  MyBooking,
  SlotSummary,
} from '@mountain-hut/shared';
import { apiGet, apiPatch, apiPost } from './client.ts';

export const fetchSlots = () => apiGet<SlotSummary[]>('/slots');

export const createBooking = (input: CreateBookingInput) =>
  apiPost<BookingResult>('/bookings', input);

// Upcoming bookings of the logged hiker, the soonest first.
export const fetchMyBookings = () => apiGet<MyBooking[]>('/bookings/me');

// PATCH /api/bookings/:id with only the details that change (MH-06).
export const changeBooking = (id: number, input: ChangeBookingInput) =>
  apiPatch<BookingResult>(`/bookings/${id}`, input);

// POST /api/bookings/:id/cancel, without a body (MH-08).
export const cancelBooking = (id: number) => apiPost<CancelledBooking>(`/bookings/${id}/cancel`);
