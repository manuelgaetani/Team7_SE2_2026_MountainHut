import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSlot,
  defineSlotTables,
  fetchFloorPlan,
  fetchSchedule,
  repeatWeeklySchedule,
} from './slots.ts';
import type { TablesSource } from './slots.ts';

const SCHEDULE_KEY = ['slots', 'schedule'] as const;

// The slots of one day, for the staff.
export function useSchedule(date: string) {
  return useQuery({ queryKey: [...SCHEDULE_KEY, date], queryFn: () => fetchSchedule(date) });
}

// The slots of several days, sharing the cache entries of useSchedule.
// `total` is the number of slots once every day is loaded, otherwise undefined.
export function useSchedules(dates: string[]) {
  return useQueries({
    queries: dates.map((date) => ({
      queryKey: [...SCHEDULE_KEY, date],
      queryFn: () => fetchSchedule(date),
    })),
    combine: (results) => ({
      total: results.every((r) => r.isSuccess)
        ? results.reduce((sum, r) => sum + (r.data?.length ?? 0), 0)
        : undefined,
      isPending: results.some((r) => r.isPending),
      isError: results.some((r) => r.isError),
    }),
  });
}

// The floor plan of one slot. It lives under SCHEDULE_KEY's parent, so it is a separate cache entry.
export function useFloorPlan(id: number) {
  return useQuery({
    queryKey: ['slots', 'floor', id] as const,
    queryFn: () => fetchFloorPlan(id),
  });
}

export function useCreateSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSlot,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SCHEDULE_KEY }),
  });
}

export function useDefineSlotTables() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, source }: { id: number; source: TablesSource }) =>
      defineSlotTables(id, source),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SCHEDULE_KEY }),
  });
}

// the copies land on other days, so every cached day of the schedule is refreshed.
export function useRepeatWeeklySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: repeatWeeklySchedule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SCHEDULE_KEY }),
  });
}
