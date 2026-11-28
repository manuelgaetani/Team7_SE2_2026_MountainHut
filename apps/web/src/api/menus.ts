import type {
  PreviousMenu as ApiPreviousMenu,
  SlotMenu as ApiSlotMenu,
} from '@mountain-hut/shared';
import { cleanCourses, type MenuCourse, type PastMenu, type SlotMenu } from '../lib/menu.ts';
import { menuToText, textToCourses } from '../lib/menuFormat.ts';
import { ApiError, apiGet, apiPut } from './client.ts';

// The answer of GET /slots/:id/menu for a slot that exists but has no menu yet.
const NO_MENU = 'This slot has no menu';

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
    if (e instanceof ApiError && e.status === 404 && e.message === NO_MENU) return null;
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
