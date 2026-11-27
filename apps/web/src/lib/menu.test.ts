import { describe, expect, it } from 'vitest';
import {
  cleanCourses,
  courseKey,
  coursesLabel,
  DEFAULT_COURSES,
  dishKey,
  formatPrice,
  markLabel,
  MAX_COURSES,
  MAX_DESCRIPTION,
  MAX_DISHES,
  MAX_PRICE,
  MENU_MARKS,
  menuErrors,
  parsePrice,
  sortMarks,
  type MenuCourse,
  type MenuDish,
  type MenuMark,
} from './menu.ts';

// MH-10: the rules of the menu editor (R2, R5). A menu has courses and dishes; a dish has an
// Italian name, an English name, a price, marks and a description. What cannot be saved: empty
// names, a price not above 0 or above 999, a description over 280 characters, no dishes.

const dish = (overrides: Partial<MenuDish> = {}): MenuDish => ({
  name: 'Polenta concia',
  translation: 'Polenta with cheese',
  price: 12,
  description: '',
  marks: [],
  ...overrides,
});
const course = (name: string, ...dishes: MenuDish[]): MenuCourse => ({ name, dishes });

describe('menu limits and defaults', () => {
  it('allows at most 4 courses of at most 4 dishes', () => {
    expect(MAX_COURSES).toBe(4);
    expect(MAX_DISHES).toBe(4);
  });

  it('caps the description at 280 characters and the price at 999 euros', () => {
    expect(MAX_DESCRIPTION).toBe(280);
    expect(MAX_PRICE).toBe(999);
  });

  it('starts from the four Italian courses', () => {
    expect(DEFAULT_COURSES).toEqual(['Antipasti', 'Primi', 'Secondi', 'Dolci']);
  });

  it('has the five allergens then vegetarian and vegan, in legend order', () => {
    expect(MENU_MARKS.map((m) => m.mark)).toEqual([
      'GLUTEN',
      'DAIRY',
      'EGG',
      'NUTS',
      'SOY',
      'VEGETARIAN',
      'VEGAN',
    ]);
  });
});

describe('markLabel', () => {
  it.each([
    ['GLUTEN', 'Gluten'],
    ['NUTS', 'Nuts'],
    ['VEGAN', 'Vegan'],
  ] as const)('labels %s as "%s"', (mark, label) => {
    expect(markLabel(mark)).toBe(label);
  });

  it('falls back to the code of a mark it does not know', () => {
    expect(markLabel('FISH' as MenuMark)).toBe('FISH');
  });
});

describe('formatPrice', () => {
  it.each([
    [9, '€ 9'],
    [12, '€ 12'],
    [9.5, '€ 9.50'],
    [0.05, '€ 0.05'],
    [999, '€ 999'],
  ])('writes %d as "%s"', (price, text) => {
    expect(formatPrice(price)).toBe(text);
  });
});

describe('parsePrice', () => {
  it.each([
    ['9', 9],
    ['9.5', 9.5],
    ['9.50', 9.5],
    ['9,50', 9.5],
    ['  12  ', 12],
    ['0', 0],
    ['999.99', 999.99],
  ])('reads "%s" as %d', (text, price) => {
    expect(parsePrice(text)).toBe(price);
  });

  it.each(['', '   ', 'abc', '1e2', '0x10', '9.505', '-1', '+3', '9.', '.5', '9,5,0', '9 50'])(
    'reads "%s" as NaN',
    (text) => {
      expect(parsePrice(text)).toBeNaN();
    },
  );
});

describe('sortMarks', () => {
  it('puts the marks in legend order', () => {
    expect(sortMarks(['VEGAN', 'GLUTEN', 'SOY'])).toEqual(['GLUTEN', 'SOY', 'VEGAN']);
  });

  it('keeps each mark once', () => {
    expect(sortMarks(['DAIRY', 'DAIRY'])).toEqual(['DAIRY']);
  });

  it('drops a mark that is not in the legend, and answers [] for no marks', () => {
    expect(sortMarks(['FISH' as MenuMark, 'EGG'])).toEqual(['EGG']);
    expect(sortMarks([])).toEqual([]);
  });
});

describe('field keys', () => {
  it('keys a course and each field of a dish by their positions', () => {
    expect(courseKey(2)).toBe('course-2');
    expect(dishKey(1, 3, 'price')).toBe('dish-1-3-price');
    expect(dishKey(0, 0, 'translation')).toBe('dish-0-0-translation');
  });
});

describe('menuErrors', () => {
  it('finds nothing in a valid menu', () => {
    expect(menuErrors([course('Primi', dish()), course('Dolci')])).toEqual({});
  });

  describe('dishes', () => {
    it('asks for at least one dish when there are no courses', () => {
      expect(menuErrors([])).toEqual({ form: 'Add at least one dish.' });
    });

    it('asks for at least one dish when every course is empty, whatever their names', () => {
      expect(menuErrors([course(''), course('Primi')])).toEqual({
        form: 'Add at least one dish.',
      });
    });
  });

  describe('course name', () => {
    it.each(['', '   '])('asks to name a course with dishes named "%s"', (name) => {
      expect(menuErrors([course(name, dish())])).toEqual({
        'course-0': 'Name the course, or remove it.',
      });
    });

    it('ignores the name of a course without dishes (left out on save)', () => {
      expect(menuErrors([course(''), course('Primi', dish())])).toEqual({});
    });
  });

  describe('names', () => {
    it.each(['', '  \t'])('asks for the Italian and the English name when "%s"', (blank) => {
      expect(menuErrors([course('Primi', dish({ name: blank, translation: blank }))])).toEqual({
        'dish-0-0-name': 'Enter the name of the dish.',
        'dish-0-0-translation': 'Enter the English name.',
      });
    });
  });

  describe('price (boundary values)', () => {
    const PRICE_LOW = 'Enter a price above 0, such as 12 or 9.50.';
    const PRICE_HIGH = 'A price can be at most € 999.';

    it.each([0.01, 1, 998.99, MAX_PRICE])('accepts %d', (price) => {
      expect(menuErrors([course('Primi', dish({ price }))])).toEqual({});
    });

    it.each([0, -0.01, -5, Number.NaN, Number.POSITIVE_INFINITY])(
      'asks for a price above 0 for %d',
      (price) => {
        expect(menuErrors([course('Primi', dish({ price }))])).toEqual({
          'dish-0-0-price': PRICE_LOW,
        });
      },
    );

    it.each([MAX_PRICE + 0.01, 1000, 5000])('caps the price for %d', (price) => {
      expect(menuErrors([course('Primi', dish({ price }))])).toEqual({
        'dish-0-0-price': PRICE_HIGH,
      });
    });
  });

  describe('description (boundary values)', () => {
    it.each([0, 1, MAX_DESCRIPTION])('accepts %d characters', (length) => {
      expect(menuErrors([course('Primi', dish({ description: 'a'.repeat(length) }))])).toEqual({});
    });

    it('rejects 281 characters', () => {
      expect(
        menuErrors([course('Primi', dish({ description: 'a'.repeat(MAX_DESCRIPTION + 1) }))]),
      ).toEqual({ 'dish-0-0-description': 'A description can be at most 280 characters.' });
    });

    it('counts the formatting and the spaces in the length', () => {
      const description = `**${'a'.repeat(MAX_DESCRIPTION - 3)}**`;
      expect(menuErrors([course('Primi', dish({ description }))])).toHaveProperty(
        'dish-0-0-description',
      );
    });
  });

  it('keys each error to its course and dish', () => {
    const errors = menuErrors([
      course('Antipasti', dish()),
      course('', dish(), dish({ name: '', price: 0 })),
    ]);
    expect(errors).toEqual({
      'course-1': 'Name the course, or remove it.',
      'dish-1-1-name': 'Enter the name of the dish.',
      'dish-1-1-price': 'Enter a price above 0, such as 12 or 9.50.',
    });
  });
});

describe('cleanCourses', () => {
  it('trims the texts, rounds the price to cents and sorts the marks', () => {
    const cleaned = cleanCourses([
      course(
        '  Primi ',
        dish({
          name: ' Polenta ',
          translation: ' Polenta ',
          price: 9.499,
          description: '  - **bread**\n  - rye  ',
          marks: ['VEGAN', 'GLUTEN'],
        }),
      ),
    ]);
    expect(cleaned).toEqual([
      {
        name: 'Primi',
        dishes: [
          {
            name: 'Polenta',
            translation: 'Polenta',
            price: 9.5,
            description: '- **bread**\n  - rye',
            marks: ['GLUTEN', 'VEGAN'],
          },
        ],
      },
    ]);
  });

  it('leaves out the courses without dishes and keeps the order of the others', () => {
    const cleaned = cleanCourses([
      course('Antipasti'),
      course('Primi', dish()),
      course('Secondi'),
      course('Dolci', dish({ name: 'Strudel' })),
    ]);
    expect(cleaned.map((c) => c.name)).toEqual(['Primi', 'Dolci']);
  });

  it('does not change the courses it is given', () => {
    const input = [course(' Primi ', dish({ marks: ['VEGAN', 'EGG'] }))];
    const copy = structuredClone(input);
    cleanCourses(input);
    expect(input).toEqual(copy);
  });

  it('answers [] for no courses', () => {
    expect(cleanCourses([])).toEqual([]);
  });
});

describe('coursesLabel', () => {
  it.each([
    [0, '0 courses'],
    [1, '1 course'],
    [2, '2 courses'],
    [4, '4 courses'],
  ])('labels %d as "%s"', (n, label) => {
    expect(coursesLabel(n)).toBe(label);
  });
});
