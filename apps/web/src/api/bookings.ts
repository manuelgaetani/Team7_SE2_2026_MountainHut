import type {
  BookingResult,
  CreateBookingInput,
  SlotSummary,
  MyBooking,
} from '@mountain-hut/shared';
import { apiGet, apiPost } from './client.ts';

export const fetchSlots = () => apiGet<SlotSummary[]>('/slots');

export const createBooking = (input: CreateBookingInput) =>
  apiPost<BookingResult>('/bookings', input);

// Upcoming bookings of the logged hiker, the soonest first.
export const fetchMyBookings = () => apiGet<MyBooking[]>('/bookings/me');
