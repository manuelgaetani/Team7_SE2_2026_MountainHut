import type { BookingResult, CreateBookingInput, SlotSummary } from '@mountain-hut/shared';
import { apiGet, apiPost } from './client.ts';

export const fetchSlots = () => apiGet<SlotSummary[]>('/slots');

export const createBooking = (input: CreateBookingInput) =>
  apiPost<BookingResult>('/bookings', input);
