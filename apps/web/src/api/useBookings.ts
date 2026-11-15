import { useQuery } from '@tanstack/react-query';
import { fetchMyBookings } from './bookings.ts';

export const MY_BOOKINGS_KEY = ['bookings', 'me'] as const;

export function useMyBookings() {
  return useQuery({ queryKey: MY_BOOKINGS_KEY, queryFn: fetchMyBookings });
}
