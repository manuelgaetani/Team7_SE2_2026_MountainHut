import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPredefinedHikes, registerHike } from './hikes.ts';

const HIKES_KEY = ['hikes'] as const;
const PREDEFINED_HIKES_KEY = [...HIKES_KEY, 'predefined'] as const;

// The hut's predefined hikes: reference data, it rarely changes.
export function usePredefinedHikes() {
  return useQuery({
    queryKey: PREDEFINED_HIKES_KEY,
    queryFn: fetchPredefinedHikes,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRegisterHike() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: registerHike,
    // The hiker's own hikes (MH-21/MH-22) live under the same key.
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: HIKES_KEY,
        predicate: (q) => q.queryKey[1] !== 'predefined',
      }),
  });
}
