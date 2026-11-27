import { describe, expect, it } from 'vitest';
import { cleanCourses, type MenuCourse } from './menu.ts';
import { menuToText, textToCourses } from './menuFormat.ts';

const MENU: MenuCourse[] = [
  {
    name: 'Antipasti',
    dishes: [
      {
        name: "Tagliere di salumi e formaggi d'alpeggio",
        translation: 'Cured meats and alpine cheeses',
        price: 9.5,
        description: 'Speck, **lardo** and *toma*:\n- bread\n  - rye\n\nServed for two.',
        marks: ['GLUTEN', 'DAIRY'],
      },
      { name: 'Insalata · € 3', translation: 'Salad', price: 7, description: '', marks: [] },
    ],
  },
  {
    name: 'Dolci',
    dishes: [
      {
        name: 'Strudel di mele',
        translation: 'Apple *strudel*',
        price: 6,
        description: '## not a course\n### not a dish\nMarks: not marks\n\\ a backslash',
        marks: ['VEGAN', 'NUTS', 'VEGETARIAN'],
      },
    ],
  },
];

describe('menuToText', () => {
  it('writes readable Markdown: course, dish with price, translation, marks, description', () => {
    const text = menuToText(cleanCourses([MENU[0]]));
    expect(text).toBe(
      [
        '## Antipasti',
        '',
        "### Tagliere di salumi e formaggi d'alpeggio · € 9.50",
        '*Cured meats and alpine cheeses*',
        'Marks: Gluten, Dairy',
        'Speck, **lardo** and *toma*:',
        '- bread',
        '  - rye',
        '',
        'Served for two.',
        '',
        '### Insalata · € 3 · € 7',
        '*Salad*',
      ].join('\n'),
    );
  });
});

describe('textToCourses', () => {
  it('reads back exactly the cleaned courses (marks in legend order, escapes undone)', () => {
    const cleaned = cleanCourses(MENU);
    expect(textToCourses(menuToText(cleaned))).toEqual(cleaned);
  });

  it('reads a dish that ends on its English name, without marks or description', () => {
    expect(textToCourses('## Primi\n\n### Polenta · € 10\n*Polenta*')).toEqual([
      {
        name: 'Primi',
        dishes: [
          { name: 'Polenta', translation: 'Polenta', price: 10, description: '', marks: [] },
        ],
      },
    ]);
  });

  it('accepts Windows line endings', () => {
    const cleaned = cleanCourses(MENU);
    expect(textToCourses(menuToText(cleaned).replace(/\n/g, '\r\n'))).toEqual(cleaned);
  });

  it.each([
    ['free text', '- Polenta\n- Spezzatino'],
    ['text before the first course', 'Today:\n## Primi\n\n### Polenta · € 10\n*Polenta*'],
    ['a course without dishes', '## Primi\n\n## Secondi\n\n### Cervo · € 15\n*Venison*'],
    ['a dish without translation', '## Primi\n\n### Polenta · € 10\nJust polenta'],
    ['a dish without a price', '## Primi\n\n### Polenta\n*Polenta*'],
    ['an unknown mark', '## Primi\n\n### Polenta · € 10\n*Polenta*\nMarks: Gluten, Fish'],
    ['an empty text', ''],
    ['a dish heading as the last line', '## Primi\n\n### Polenta · € 10'],
  ])('gives null for %s', (_name, text) => {
    expect(textToCourses(text)).toBeNull();
  });
});
