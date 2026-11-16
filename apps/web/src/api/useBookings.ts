import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBooking, fetchSlots } from './bookings.ts';

const SLOTS_KEY = ['slots'] as const;

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
