import {
  formatPrice,
  MENU_MARKS,
  sortMarks,
  type MenuCourse,
  type MenuDish,
  type MenuMark,
} from './menu.ts';

// MH-10: the API stores the menu of a slot as one free text (a small Markdown subset). The menu
// editor writes its courses into that text, readable as it is, and reads them back:
//
//   ## Antipasti
//
//   ### Tagliere di salumi · € 9.50
//   *Cured meats and alpine cheeses*
//   Marks: Gluten, Dairy
//   Description, with **bold**, *italic*, "- " items and "  - " sub-items.
//
// A text that does not follow this layout exactly is not a menu of the editor: `textToCourses`
// gives null and the pages show it as formatted free text.

const COURSE = /^## (.+)$/;
const DISH = /^### (.+) · € (\d+(?:\.\d{1,2})?)$/;
const TRANSLATION = /^\*(.+)\*$/;
const MARKS = /^Marks: (.+)$/;
const MARKS_PREFIX = 'Marks:';
// A description line that would read as one of the lines above gets a backslash in front.
const needsEscape = (line: string): boolean =>
  line.startsWith('#') || line.startsWith('\\') || line.startsWith(MARKS_PREFIX);

const markOf = (label: string): MenuMark | undefined =>
  MENU_MARKS.find((m) => m.label === label)?.mark;

function dishLines(dish: MenuDish): string[] {
  const lines = [`### ${dish.name} · ${formatPrice(dish.price)}`, `*${dish.translation}*`];
  if (dish.marks.length > 0) {
    const labels = sortMarks(dish.marks).map((m) => MENU_MARKS.find((x) => x.mark === m)?.label);
    lines.push(`Marks: ${labels.join(', ')}`);
  }
  if (dish.description !== '') {
    for (const line of dish.description.replace(/\r\n?/g, '\n').split('\n')) {
      lines.push(needsEscape(line) ? `\\${line}` : line);
    }
  }
  return lines;
}

// The text sent to the API for courses already cleaned (`cleanCourses`).
export function menuToText(courses: MenuCourse[]): string {
  return courses
    .map((course) =>
      [
        `## ${course.name}`,
        ...course.dishes.map((dish) => ['', ...dishLines(dish)].join('\n')),
      ].join('\n'),
    )
    .join('\n\n');
}

// Reads one dish from its lines (heading first); null if they do not follow the layout.
function readDish(lines: string[]): MenuDish | null {
  const head = DISH.exec(lines[0]);
  const translation = TRANSLATION.exec(lines[1] ?? '');
  if (!head || !translation) return null;
  let rest = lines.slice(2);
  let marks: MenuMark[] = [];
  const marksLine = MARKS.exec(rest[0] ?? '');
  if (marksLine) {
    const found = marksLine[1].split(', ').map(markOf);
    if (found.some((m) => m === undefined)) return null;
    marks = sortMarks(found.filter((m): m is MenuMark => m !== undefined));
    rest = rest.slice(1);
  }
  const description = rest
    .map((line) => (line.startsWith('\\') ? line.slice(1) : line))
    .join('\n')
    .trim();
  return {
    name: head[1],
    translation: translation[1],
    price: Number(head[2]),
    description,
    marks,
  };
}

// The courses written in a text by `menuToText`, or null for any other text.
export function textToCourses(text: string): MenuCourse[] | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const courses: { name: string; dishes: string[][] }[] = [];
  for (const line of lines) {
    const course = DISH.test(line) ? null : COURSE.exec(line);
    const current = courses.at(-1);
    if (course) courses.push({ name: course[1], dishes: [] });
    else if (DISH.test(line) && current) current.dishes.push([line]);
    else if (current && current.dishes.length > 0)
      current.dishes[current.dishes.length - 1].push(line);
    // Only blank lines may come between a course name and its first dish, or before a course.
    else if (line.trim() !== '') return null;
  }
  if (courses.length === 0) return null;

  const result: MenuCourse[] = [];
  for (const course of courses) {
    if (course.dishes.length === 0) return null;
    const dishes: MenuDish[] = [];
    for (const lines of course.dishes) {
      const dish = readDish(lines);
      if (!dish) return null;
      dishes.push(dish);
    }
    result.push({ name: course.name, dishes });
  }
  return result;
}
