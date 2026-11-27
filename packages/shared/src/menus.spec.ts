import { describe, expect, it } from 'vitest';
import { MAX_MENU_LENGTH, MENU_ERRORS, defineMenuSchema } from './menus.js';

// Spec MH-10: Define menus.
// An employee writes the menu of a slot as free text. The text can use basic formatting
// (bold, italic, item lists with sub items), written as a small Markdown subset:
//   **bold**   *italic*   "- item"   "  - sub item"
// The schema checks only the text: it is kept exactly as written, so the formatting
// (new lines, indentation, asterisks) reaches the database unchanged.
// Contract: body { text: string }, at least one visible character, at most MAX_MENU_LENGTH (5000)
// characters, no NUL character. Unknown fields are stripped.
// TODO(MH-10-graybox): add gray-box unit tests for database state transitions and query constraints
describe('defineMenuSchema (Black-box)', () => {
  const formatted = [
    '**Lunch menu**',
    '',
    '- Starters',
    '  - *Polenta* with mushrooms',
    '  - Barley soup',
    '- Dessert',
  ].join('\n');

  describe('Equivalence Partitioning: Valid Payloads', () => {
    it('accepts a plain text menu', () => {
      const res = defineMenuSchema.safeParse({ text: 'Polenta and stew' });
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ text: 'Polenta and stew' });
    });

    it('keeps a formatted menu exactly as written', () => {
      const res = defineMenuSchema.safeParse({ text: formatted });
      expect(res.success).toBe(true);
      expect(res.data?.text).toBe(formatted);
    });

    it('keeps Windows line endings and tabs unchanged', () => {
      const text = '- Starters\r\n\t- Polenta';
      expect(defineMenuSchema.parse({ text }).text).toBe(text);
    });

    it('accepts accented letters and symbols of a real menu', () => {
      const text = 'Crème brûlée – 6 € · caffè';
      expect(defineMenuSchema.parse({ text }).text).toBe(text);
    });

    it('strips unknown fields from the payload', () => {
      const parsed = defineMenuSchema.parse({ text: 'Soup', slotId: 3, author: 'x' });
      expect(parsed).toEqual({ text: 'Soup' });
    });
  });

  describe('Equivalence Partitioning: Missing or Wrong Types', () => {
    it.each([
      ['an empty payload', {}],
      ['null input', null],
      ['undefined input', undefined],
      ['a number as text', { text: 42 }],
      ['an array as text', { text: ['Soup'] }],
      ['null text', { text: null }],
    ])('rejects %s', (_label, payload) => {
      expect(defineMenuSchema.safeParse(payload).success).toBe(false);
    });
  });

  describe('Equivalence Partitioning: Empty Text', () => {
    it.each([
      ['an empty string', ''],
      ['only spaces', '   '],
      ['only new lines', '\n\n\r\n'],
      ['only tabs', '\t\t'],
    ])('rejects %s with a clear message', (_label, text) => {
      const res = defineMenuSchema.safeParse({ text });
      expect(res.success).toBe(false);
      expect(res.error?.issues[0]?.message).toBe('The menu cannot be empty');
    });
  });

  describe('Boundary Value Analysis (BVA): text length', () => {
    it('sets the maximum length at 5000 characters', () => {
      expect(MAX_MENU_LENGTH).toBe(5000);
    });

    it.each([1, 2, MAX_MENU_LENGTH - 1, MAX_MENU_LENGTH])(
      'accepts a text of %d characters',
      (length) => {
        expect(defineMenuSchema.safeParse({ text: 'a'.repeat(length) }).success).toBe(true);
      },
    );

    it.each([MAX_MENU_LENGTH + 1, MAX_MENU_LENGTH * 2])(
      'rejects a text of %d characters',
      (length) => {
        const res = defineMenuSchema.safeParse({ text: 'a'.repeat(length) });
        expect(res.success).toBe(false);
        expect(res.error?.issues[0]?.message).toContain(String(MAX_MENU_LENGTH));
      },
    );

    it('counts the formatting characters in the length', () => {
      // 4 asterisks + 4997 letters = 5001 characters.
      const text = `**${'a'.repeat(MAX_MENU_LENGTH - 3)}**`;
      expect(defineMenuSchema.safeParse({ text }).success).toBe(false);
    });
  });
});

// MH-10 white box: the checks of the schema one by one (max length, visible character, NUL),
// including the texts that fail more than one of them.
describe('defineMenuSchema (White-box)', () => {
  const issuesOf = (text: string) => {
    const res = defineMenuSchema.safeParse({ text });
    return res.success ? [] : res.error.issues.map((i) => i.message);
  };

  describe('hasNoNulByte refinement', () => {
    it.each([
      ['alone', '\u0000'],
      ['at the start', '\u0000Soup'],
      ['in the middle', 'Polenta\u0000and stew'],
      ['at the end', 'Soup\u0000'],
    ])('rejects a NUL character %s', (_label, text) => {
      expect(issuesOf(text)).toContain('Invalid character');
    });

    it('reports the NUL issue on the text field', () => {
      const res = defineMenuSchema.safeParse({ text: 'Soup\u0000' });
      expect(res.error?.issues).toEqual([
        expect.objectContaining({ path: ['text'], message: 'Invalid character' }),
      ]);
    });

    it('accepts other control characters, which PostgreSQL can store', () => {
      expect(defineMenuSchema.safeParse({ text: 'Soup\u0001\u001f\u007f' }).success).toBe(true);
    });
  });

  describe('hasVisibleCharacter refinement', () => {
    it('accepts a single visible character among white space', () => {
      expect(defineMenuSchema.safeParse({ text: ' \n\t.\r\n ' }).success).toBe(true);
    });

    it('treats non-breaking and other Unicode spaces as empty, like String.prototype.trim', () => {
      expect(issuesOf('\u00a0\u2003\ufeff')).toEqual(['The menu cannot be empty']);
    });

    it('counts a NUL character alone as visible, then rejects it as invalid', () => {
      expect(issuesOf('\u0000')).toEqual(['Invalid character']);
    });
  });

  describe('Checks that fail together', () => {
    it('reports both the length and the empty text for a long text of spaces', () => {
      expect(issuesOf(' '.repeat(MAX_MENU_LENGTH + 1))).toEqual([
        `The menu can have at most ${MAX_MENU_LENGTH} characters`,
        'The menu cannot be empty',
      ]);
    });

    it('reports both the length and the NUL character for a long text with a NUL', () => {
      expect(issuesOf(`${'a'.repeat(MAX_MENU_LENGTH)}\u0000`)).toEqual([
        `The menu can have at most ${MAX_MENU_LENGTH} characters`,
        'Invalid character',
      ]);
    });

    it('reports a single issue for a text within the limit with only a NUL problem', () => {
      expect(issuesOf(`${'a'.repeat(MAX_MENU_LENGTH - 1)}\u0000`)).toEqual(['Invalid character']);
    });
  });
});

// MH-10: the messages the web app and the tests tell apart. They are part of the API contract,
// so a change here is a change of the contract.
describe('MENU_ERRORS', () => {
  it('has the two 404 messages: wrong slot and slot without a menu', () => {
    expect(MENU_ERRORS.slotNotFound).toBe('Slot not found');
    expect(MENU_ERRORS.noMenu).toBe('This slot has no menu');
  });

  it('has the two 422 messages for a slot that has started: change and delete', () => {
    expect(MENU_ERRORS.startedChange).toBe(
      'The slot has already started: its menu cannot be changed',
    );
    expect(MENU_ERRORS.startedDelete).toBe(
      'The slot has already started: its menu cannot be deleted',
    );
  });

  it('has a different message for each case', () => {
    const messages = Object.values(MENU_ERRORS);
    expect(new Set(messages).size).toBe(messages.length);
  });
});
