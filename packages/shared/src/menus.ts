import { z } from 'zod';

// MH-10: the menu of a slot is free text with basic formatting, written as a small Markdown
// subset that the web app renders: **bold**, *italic*, "- item" and "  - sub item".
// The text is stored exactly as written: new lines, indentation and asterisks are the formatting.

// Most characters of a menu, formatting included: a limit against mistakes, not a rule of the story.
export const MAX_MENU_LENGTH = 5000;

const hasVisibleCharacter = (s: string): boolean => s.trim().length > 0;
// PostgreSQL cannot store a NUL character in a TEXT column.
const hasNoNulByte = (s: string): boolean => !s.includes('\u0000');

export const defineMenuSchema = z.object({
  // Not trimmed: the leading spaces of a sub item are part of the formatting.
  text: z
    .string()
    .max(MAX_MENU_LENGTH, `The menu can have at most ${MAX_MENU_LENGTH} characters`)
    .refine(hasVisibleCharacter, 'The menu cannot be empty')
    .refine(hasNoNulByte, 'Invalid character'),
});
export type DefineMenuInput = z.infer<typeof defineMenuSchema>;

// The messages of the menu endpoints that the web app and the tests tell apart.
export const MENU_ERRORS = {
  // 404: the slot does not exist.
  slotNotFound: 'Slot not found',
  // 404: the slot exists but has no menu.
  noMenu: 'This slot has no menu',
  // 422: from its start on, the menu of a slot stays as it is.
  startedChange: 'The slot has already started: its menu cannot be changed',
  startedDelete: 'The slot has already started: its menu cannot be deleted',
} as const;

// The menu of a slot.
export interface SlotMenu {
  slotId: number;
  text: string;
  // When the menu was last written (ISO 8601).
  updatedAt: string;
}

// A menu already written, with the slot it belongs to: the staff reuse it (and change it) for
// another slot.
export interface PreviousMenu extends SlotMenu {
  date: string;
  startTime: string;
  endTime: string;
}
