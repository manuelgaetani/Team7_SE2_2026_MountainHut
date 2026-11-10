import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSlot, defineSlotTables, fetchFloorPlan, fetchSchedule } from './slots.ts';
import type { TablesSource } from './slots.ts';

const SCHEDULE_KEY = ['slots', 'schedule'] as const;

// The slots of one day, for the staff.
export function useSchedule(date: string) {
  return useQuery({ queryKey: [...SCHEDULE_KEY, date], queryFn: () => fetchSchedule(date) });
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
