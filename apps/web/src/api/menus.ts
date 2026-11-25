import { cleanCourses, type MenuCourse, type MenuSlot, type SlotMenu } from '../lib/menu.ts';
import { MENU_SEED } from './menuSeed.ts';

export type { SlotMenu };

// MH-10 runs in the browser until the API stores the menus: these three functions keep the
// shape of the future requests (GET /slots/:id/menu, GET /menus, PUT /slots/:id/menu), so the
// integration only changes their bodies.
const STORAGE_KEY = 'mh.menus';
const DELAY_MS = 250;

const wait = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));

const isString = (v: unknown): v is string => typeof v === 'string';
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const isDish = (d: unknown): boolean =>
  isRecord(d) &&
  isString(d.name) &&
  isString(d.translation) &&
  isString(d.description) &&
  typeof d.price === 'number' &&
  Number.isFinite(d.price) &&
  Array.isArray(d.marks) &&
  d.marks.every(isString);

const isCourse = (c: unknown): boolean =>
  isRecord(c) && isString(c.name) && Array.isArray(c.dishes) && c.dishes.every(isDish);

// Every field the pages read, so a damaged entry is dropped instead of breaking a page.
const isSlotMenu = (m: unknown): m is SlotMenu =>
  isRecord(m) &&
  typeof m.slotId === 'number' &&
  isString(m.date) &&
  isString(m.startTime) &&
  isString(m.endTime) &&
  isString(m.updatedAt) &&
  Array.isArray(m.courses) &&
  m.courses.every(isCourse);

// The stored menus; the seed when nothing is stored, or what is stored cannot be read.
function readAll(): SlotMenu[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(isSlotMenu);
    }
  } catch {
    // Storage blocked or broken JSON: start again from the seed.
  }
  return MENU_SEED;
}

function writeAll(menus: SlotMenu[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(menus));
  } catch {
    throw new Error('The menu could not be saved in this browser.');
  }
}

// The menu of one slot, or null when the staff have not written it yet.
export async function fetchSlotMenu(slotId: number): Promise<SlotMenu | null> {
  await wait();
  return readAll().find((m) => m.slotId === slotId) ?? null;
}

// Every saved menu, the latest slot first: the ones the staff can start from.
export async function fetchPastMenus(): Promise<SlotMenu[]> {
  await wait();
  return [...readAll()].sort(
    (a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime),
  );
}

export async function saveSlotMenu(slot: MenuSlot, courses: MenuCourse[]): Promise<SlotMenu> {
  await wait();
  const menu: SlotMenu = {
    slotId: slot.id,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    courses: cleanCourses(courses),
    updatedAt: new Date().toISOString(),
  };
  writeAll([...readAll().filter((m) => m.slotId !== slot.id), menu]);
  return menu;
}
