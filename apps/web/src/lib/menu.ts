// MH-10: the menu of a time slot. A few courses, a few dishes of quality: a mountain hut.
// Web-only types for now; they move to packages/shared when the API lands.

export type MenuMark = 'GLUTEN' | 'DAIRY' | 'EGG' | 'NUTS' | 'SOY' | 'VEGETARIAN' | 'VEGAN';

// What a mark says on the menu: the five allergens the dish contains, or what the dish is.
export const MENU_MARKS: readonly { mark: MenuMark; label: string }[] = [
  { mark: 'GLUTEN', label: 'Gluten' },
  { mark: 'DAIRY', label: 'Dairy' },
  { mark: 'EGG', label: 'Egg' },
  { mark: 'NUTS', label: 'Nuts' },
  { mark: 'SOY', label: 'Soy' },
  { mark: 'VEGETARIAN', label: 'Vegetarian' },
  { mark: 'VEGAN', label: 'Vegan' },
];

export const markLabel = (mark: MenuMark): string =>
  MENU_MARKS.find((m) => m.mark === mark)?.label ?? mark;

export interface MenuDish {
  // Italian name, as printed on the menu.
  name: string;
  // English name, printed small below.
  translation: string;
  // Euros.
  price: number;
  // Short text with **bold**, *italic*, "- " items and "  - " sub-items.
  description: string;
  marks: MenuMark[];
}

export interface MenuCourse {
  name: string;
  dishes: MenuDish[];
}

export interface SlotMenu {
  slotId: number;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  courses: MenuCourse[];
  updatedAt: string; // ISO
}

// The slot a menu belongs to.
export interface MenuSlot {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
}

export const MAX_COURSES = 4;
export const MAX_DISHES = 4;
export const MAX_DESCRIPTION = 280;
export const MAX_PRICE = 999;

export const DEFAULT_COURSES = ['Antipasti', 'Primi', 'Secondi', 'Dolci'] as const;

export const emptyDish = (): MenuDish => ({
  name: '',
  translation: '',
  price: 0,
  description: '',
  marks: [],
});

// "€ 9" or "€ 9.50".
export const formatPrice = (price: number): string =>
  `€ ${Number.isInteger(price) ? price : price.toFixed(2)}`;

// A price as typed: "9", "9.5", "9,50". NaN when it is not a number.
export const parsePrice = (text: string): number =>
  text.trim() === '' ? Number.NaN : Number(text.trim().replace(',', '.'));

// The marks in the order of the legend.
export const sortMarks = (marks: MenuMark[]): MenuMark[] =>
  MENU_MARKS.map((m) => m.mark).filter((m) => marks.includes(m));

export const courseKey = (c: number): string => `course-${c}`;
export const dishKey = (
  c: number,
  d: number,
  field: 'name' | 'translation' | 'price' | 'description',
) => `dish-${c}-${d}-${field}`;

// The messages of the fields that cannot be saved, keyed as above, plus "form" for the menu.
export function menuErrors(courses: MenuCourse[]): Partial<Record<string, string>> {
  const found: Partial<Record<string, string>> = {};
  courses.forEach((course, c) => {
    if (course.name.trim() === '') found[courseKey(c)] = 'Name the course, or remove it.';
    course.dishes.forEach((dish, d) => {
      if (dish.name.trim() === '') found[dishKey(c, d, 'name')] = 'Enter the name of the dish.';
      if (dish.translation.trim() === '') {
        found[dishKey(c, d, 'translation')] = 'Enter the English name.';
      }
      if (!Number.isFinite(dish.price) || dish.price <= 0) {
        found[dishKey(c, d, 'price')] = 'Enter a price above 0.';
      } else if (dish.price > MAX_PRICE) {
        found[dishKey(c, d, 'price')] = `A price can be at most € ${MAX_PRICE}.`;
      }
      if (dish.description.length > MAX_DESCRIPTION) {
        found[dishKey(c, d, 'description')] =
          `A description can be at most ${MAX_DESCRIPTION} characters.`;
      }
    });
  });
  if (!courses.some((c) => c.dishes.length > 0)) found.form = 'Add at least one dish.';
  return found;
}

// What is stored: trimmed text, marks in legend order, courses without dishes left out.
export const cleanCourses = (courses: MenuCourse[]): MenuCourse[] =>
  courses
    .filter((c) => c.dishes.length > 0)
    .map((c) => ({
      name: c.name.trim(),
      dishes: c.dishes.map((d) => ({
        name: d.name.trim(),
        translation: d.translation.trim(),
        price: Math.round(d.price * 100) / 100,
        description: d.description.trim(),
        marks: sortMarks(d.marks),
      })),
    }));

export const coursesLabel = (n: number): string => (n === 1 ? '1 course' : `${n} courses`);
