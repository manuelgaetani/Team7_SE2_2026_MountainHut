import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MenuCourse } from '../lib/menu.ts';
import { fetchPastMenus, fetchSlotMenu, saveSlotMenu } from './menus.ts';

const MENUS_KEY = ['menus'] as const;

// The menu of one slot; nothing is asked while no slot is chosen.
export function useSlotMenu(slotId: number | null) {
  return useQuery({
    queryKey: [...MENUS_KEY, 'slot', slotId] as const,
    queryFn: () => fetchSlotMenu(slotId ?? 0),
    enabled: slotId !== null,
  });
}

// The saved menus the staff can reuse (staff only: hikers get 403).
export function usePastMenus() {
  return useQuery({ queryKey: [...MENUS_KEY, 'past'] as const, queryFn: fetchPastMenus });
}

export function useSaveSlotMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, courses }: { slotId: number; courses: MenuCourse[] }) =>
      saveSlotMenu(slotId, courses),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MENUS_KEY }),
  });
}
