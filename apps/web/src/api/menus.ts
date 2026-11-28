import { MENU_ERRORS } from '@mountain-hut/shared';
import type {
  PreviousMenu as ApiPreviousMenu,
  SlotMenu as ApiSlotMenu,
} from '@mountain-hut/shared';
import { cleanCourses, type MenuCourse, type PastMenu, type SlotMenu } from '../lib/menu.ts';
import { menuToText, textToCourses } from '../lib/menuFormat.ts';
import { ApiError, apiDelete, apiGet, apiPut } from './client.ts';

const toSlotMenu = (menu: ApiSlotMenu): SlotMenu => ({
  slotId: menu.slotId,
  text: menu.text,
  courses: textToCourses(menu.text),
  updatedAt: menu.updatedAt,
});

// The menu of one slot, or null when the staff have not written it yet.
export async function fetchSlotMenu(slotId: number): Promise<SlotMenu | null> {
  try {
    return toSlotMenu(await apiGet<ApiSlotMenu>(`/slots/${slotId}/menu`));
  } catch (e) {
    // The slot exists but the staff have not written its menu yet.
    if (e instanceof ApiError && e.status === 404 && e.message === MENU_ERRORS.noMenu) return null;
    throw e;
  }
}

// The menus already written (each text once, with its latest slot), the latest slot first:
// the ones the staff can start from. Staff only.
export async function fetchPastMenus(): Promise<PastMenu[]> {
  const menus = await apiGet<ApiPreviousMenu[]>('/menus');
  return menus.map((m) => ({
    ...toSlotMenu(m),
    date: m.date,
    startTime: m.startTime,
    endTime: m.endTime,
  }));
}

// Creates or replaces the menu of the slot. Staff only.
export async function saveSlotMenu(slotId: number, courses: MenuCourse[]): Promise<SlotMenu> {
  const text = menuToText(cleanCourses(courses));
  return toSlotMenu(await apiPut<ApiSlotMenu>(`/slots/${slotId}/menu`, { text }));
}

// Deletes the menu of a slot that has not started yet. Staff only.
export async function deleteSlotMenu(slotId: number): Promise<void> {
  await apiDelete(`/slots/${slotId}/menu`);
}
