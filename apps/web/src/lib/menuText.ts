// The little formatting of a dish description: **bold**, *italic*, "- " items and "  - "
// sub-items (two spaces, or a tab, before the dash). Everything else is plain text, and a
// marker without its closing pair stays as typed.

export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface ListItem {
  inline: Inline[];
  sub: Inline[][];
}

export type Block = { kind: 'p'; inline: Inline[] } | { kind: 'list'; items: ListItem[] };

const ITEM = /^- (.*)$/;
const SUB_ITEM = /^(?: {2,}|\t)- (.*)$/;

// Splits a line on **…** and *…*, bold first so "**" is never read as two italics.
export function parseInline(line: string): Inline[] {
  const parts: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*|\*([^*]+?)\*/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    if (match.index > last) parts.push({ text: line.slice(last, match.index) });
    if (match[1] !== undefined) parts.push({ text: match[1], bold: true });
    else parts.push({ text: match[2], italic: true });
    last = match.index + match[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last) });
  return parts;
}

export function parseMenuText(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: ListItem[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'p', inline: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list && list.length > 0) blocks.push({ kind: 'list', items: list });
    list = null;
  };

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const sub = SUB_ITEM.exec(raw);
    const item = sub ? null : ITEM.exec(raw.trimStart());
    if (sub) {
      flushParagraph();
      list ??= [];
      // A sub-item with no item above it hangs from an empty one.
      if (list.length === 0) list.push({ inline: [], sub: [] });
      list[list.length - 1].sub.push(parseInline(sub[1]));
    } else if (item) {
      flushParagraph();
      list ??= [];
      list.push({ inline: parseInline(item[1]), sub: [] });
    } else if (raw.trim() === '') {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(raw.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
