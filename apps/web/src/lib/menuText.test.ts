import { describe, expect, it } from 'vitest';
import { parseInline, parseMenuText } from './menuText.ts';

// MH-10 (R3): the formatting of a dish description. **bold**, *italic*, "- " items and "  - "
// sub-items (two or more spaces, or a tab, before the dash). Everything else is plain text, and
// a marker without its closing pair stays as typed.

describe('parseInline', () => {
  it('answers [] for an empty line', () => {
    expect(parseInline('')).toEqual([]);
  });

  it('keeps a line without markers as one plain part', () => {
    expect(parseInline('Polenta and stew')).toEqual([{ text: 'Polenta and stew' }]);
  });

  it('reads bold and italic with the plain text around them', () => {
    expect(parseInline('Speck, **lardo** and *toma*.')).toEqual([
      { text: 'Speck, ' },
      { text: 'lardo', bold: true },
      { text: ' and ' },
      { text: 'toma', italic: true },
      { text: '.' },
    ]);
  });

  it('reads a line that is all bold, or all italic', () => {
    expect(parseInline('**Lardo**')).toEqual([{ text: 'Lardo', bold: true }]);
    expect(parseInline('*Toma*')).toEqual([{ text: 'Toma', italic: true }]);
  });

  it('reads bold before italic, so "**" is never two italics', () => {
    expect(parseInline('**a** *b*')).toEqual([
      { text: 'a', bold: true },
      { text: ' ' },
      { text: 'b', italic: true },
    ]);
  });

  it('closes a bold at the first "**" (not greedy)', () => {
    expect(parseInline('**a** and **b**')).toEqual([
      { text: 'a', bold: true },
      { text: ' and ' },
      { text: 'b', bold: true },
    ]);
  });

  it.each([
    ['an opening "**" only', '**lardo', [{ text: '**lardo' }]],
    ['an opening "*" only', 'toma*', [{ text: 'toma*' }]],
    ['empty bold', '****', [{ text: '****' }]],
    ['empty italic', '**', [{ text: '**' }]],
    ['a lone asterisk', '5 * 2', [{ text: '5 * 2' }]],
  ])('keeps %s as typed', (_label, line, parts) => {
    expect(parseInline(line)).toEqual(parts);
  });
});

describe('parseMenuText', () => {
  it('answers no blocks for an empty or blank text', () => {
    expect(parseMenuText('')).toEqual([]);
    expect(parseMenuText(' \n\t\n')).toEqual([]);
  });

  it('joins the lines of a paragraph with a space, trimmed', () => {
    expect(parseMenuText('  Served  \nfor two.  ')).toEqual([
      { kind: 'p', inline: [{ text: 'Served for two.' }] },
    ]);
  });

  it('splits paragraphs on a blank line', () => {
    expect(parseMenuText('One\n\nTwo')).toEqual([
      { kind: 'p', inline: [{ text: 'One' }] },
      { kind: 'p', inline: [{ text: 'Two' }] },
    ]);
  });

  it('reads items and their sub-items, with formatting', () => {
    expect(parseMenuText('- **bread**\n  - rye\n\t- *spelt*\n- butter')).toEqual([
      {
        kind: 'list',
        items: [
          {
            inline: [{ text: 'bread', bold: true }],
            sub: [[{ text: 'rye' }], [{ text: 'spelt', italic: true }]],
          },
          { inline: [{ text: 'butter' }], sub: [] },
        ],
      },
    ]);
  });

  it('reads a sub-item after two or more spaces, an item after fewer', () => {
    expect(parseMenuText('- a\n    - deep\n - shallow')).toEqual([
      {
        kind: 'list',
        items: [
          { inline: [{ text: 'a' }], sub: [[{ text: 'deep' }]] },
          { inline: [{ text: 'shallow' }], sub: [] },
        ],
      },
    ]);
  });

  it('hangs a sub-item with no item above it from an empty item', () => {
    expect(parseMenuText('  - rye')).toEqual([
      { kind: 'list', items: [{ inline: [], sub: [[{ text: 'rye' }]] }] },
    ]);
  });

  it('needs a space after the dash: "-bread" is plain text', () => {
    expect(parseMenuText('-bread')).toEqual([{ kind: 'p', inline: [{ text: '-bread' }] }]);
  });

  it('ends a list on a paragraph line and a paragraph on a list item', () => {
    expect(parseMenuText('Intro\n- a\nOutro')).toEqual([
      { kind: 'p', inline: [{ text: 'Intro' }] },
      { kind: 'list', items: [{ inline: [{ text: 'a' }], sub: [] }] },
      { kind: 'p', inline: [{ text: 'Outro' }] },
    ]);
  });

  it('starts a new list after a blank line', () => {
    expect(parseMenuText('- a\n\n- b')).toEqual([
      { kind: 'list', items: [{ inline: [{ text: 'a' }], sub: [] }] },
      { kind: 'list', items: [{ inline: [{ text: 'b' }], sub: [] }] },
    ]);
  });

  it('reads Windows and old Mac line endings like new lines', () => {
    const expected = parseMenuText('One\n- a\n  - b\n\nTwo');
    expect(parseMenuText('One\r\n- a\r\n  - b\r\n\r\nTwo')).toEqual(expected);
    expect(parseMenuText('One\r- a\r  - b\r\rTwo')).toEqual(expected);
  });
});
