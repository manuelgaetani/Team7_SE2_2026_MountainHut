import { describe, expect, it } from 'vitest';
import { MAX_MENU_LENGTH, defineMenuSchema } from './menus.js';

// Spec MH-10: Define menus.
// An employee writes the menu of a slot as free text. The text can use basic formatting
// (bold, italic, item lists with sub items), written as a small Markdown subset:
//   **bold**   *italic*   "- item"   "  - sub item"
// The schema checks only the text: it is kept exactly as written, so the formatting
// (new lines, indentation, asterisks) reaches the database unchanged.
// Contract: body { text: string }, at least one visible character, at most MAX_MENU_LENGTH (5000)
// characters. Unknown fields are stripped.
// TODO(MH-10-whitebox): add white-box unit tests once the schema is implemented
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