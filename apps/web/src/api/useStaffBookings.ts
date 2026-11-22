import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MIN_HIKER_SEARCH_LENGTH } from '@mountain-hut/shared';
import { createStaffBooking, searchHikers } from './staffBookings.ts';

const HIKERS_KEY = ['hikers'] as const;
const SLOTS_KEY = ['slots'] as const;

// Runs only when the search is long enough: shorter ones would list almost every hiker.
export function useHikerSearch(search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: [...HIKERS_KEY, 'search', term],
    queryFn: () => searchHikers(term),
    enabled: term.length >= MIN_HIKER_SEARCH_LENGTH,
  });
}

export function useCreateStaffBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createStaffBooking,
    onSettled: () => {
      // New hikers can appear in the search, and the slots have fewer free seats.
      void queryClient.invalidateQueries({ queryKey: HIKERS_KEY });
      void queryClient.invalidateQueries({ queryKey: SLOTS_KEY });
    },
  });
}
