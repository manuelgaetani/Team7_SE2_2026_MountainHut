import { useQuery } from '@tanstack/react-query';
import type { CheckAvailabilityQuery } from '@mountain-hut/shared';
import { fetchAvailability } from './availability.ts';

// Runs the check once a query is given; null means nothing has been asked yet.
export function useAvailability(query: CheckAvailabilityQuery | null) {
  return useQuery({
    queryKey: ['availability', query] as const,
    queryFn: () => fetchAvailability(query!),
    enabled: query !== null,
  });
}
