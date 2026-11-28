import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkInHike,
  fetchMyHikes,
  fetchPredefinedHikes,
  fetchStaffHikes,
  registerHike,
} from './hikes.ts';

const PREDEFINED_HIKES_KEY = ['hikes', 'predefined'] as const;
const MY_HIKES_KEY = ['hikes', 'mine'] as const;
const STAFF_HIKES_KEY = ['hikes', 'staff'] as const;

// The hut's predefined hikes: reference data, it rarely changes.
export function usePredefinedHikes() {
  return useQuery({
    queryKey: PREDEFINED_HIKES_KEY,
    queryFn: fetchPredefinedHikes,
    staleTime: 5 * 60 * 1000,
  });
}

// The hikes of the logged-in hiker, for the personal area.
export function useMyHikes() {
  return useQuery({ queryKey: MY_HIKES_KEY, queryFn: fetchMyHikes });
}

// Every registered hike, for the staff. Refreshed every minute: the page stays open at the desk.
export function useStaffHikes() {
  return useQuery({
    queryKey: STAFF_HIKES_KEY,
    queryFn: fetchStaffHikes,
    refetchInterval: 60 * 1000,
  });
}

export function useRegisterHike() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: registerHike,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_HIKES_KEY }),
  });
}

// MH-21: a check-in changes the state of the hike in both lists.
export function useCheckInHike() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: checkInHike,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MY_HIKES_KEY }),
        queryClient.invalidateQueries({ queryKey: STAFF_HIKES_KEY }),
      ]);
    },
  });
}
