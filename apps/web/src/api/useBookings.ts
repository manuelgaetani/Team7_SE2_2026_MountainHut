import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangeBookingInput } from '@mountain-hut/shared';
import {
  cancelBooking,
  changeBooking,
  createBooking,
  fetchMyBookings,
  fetchSlots,
} from './bookings.ts';

export const MY_BOOKINGS_KEY = ['bookings', 'me'] as const;
// The booking page and the change dialog read the same list of slots.
export const SLOTS_KEY = ['slots'] as const;

// The slots a hiker can book.
export function useBookableSlots() {
  return useQuery({ queryKey: SLOTS_KEY, queryFn: fetchSlots });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBooking,
    onSettled: () => queryClient.invalidateQueries({ queryKey: SLOTS_KEY }),
  });
}

export function useMyBookings() {
  return useQuery({ queryKey: MY_BOOKINGS_KEY, queryFn: fetchMyBookings });
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

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelBooking,
    // The booking moves to the cancelled ones and its seats are free again.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: MY_BOOKINGS_KEY }),
        queryClient.invalidateQueries({ queryKey: SLOTS_KEY }),
      ]),
  });
}
