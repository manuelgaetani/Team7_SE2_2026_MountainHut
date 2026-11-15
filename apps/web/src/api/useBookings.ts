import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { changeBooking, fetchMyBookings, fetchSlots } from './bookings.ts';
import type { ChangeBookingInput } from './bookings.ts';

export const MY_BOOKINGS_KEY = ['bookings', 'me'] as const;
// Same key as the booking page: both read the same list of slots.
export const SLOTS_KEY = ['slots'] as const;

export function useMyBookings() {
  return useQuery({ queryKey: MY_BOOKINGS_KEY, queryFn: fetchMyBookings });
}

// Upcoming slots, to move a booking to another date or time.
export function useUpcomingSlots() {
  return useQuery({ queryKey: SLOTS_KEY, queryFn: fetchSlots });
}

export function useChangeBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ChangeBookingInput }) =>
      changeBooking(id, input),
    // The booking and the free seats of the slots have changed.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: MY_BOOKINGS_KEY }),
        queryClient.invalidateQueries({ queryKey: SLOTS_KEY }),
      ]),
  });
}
