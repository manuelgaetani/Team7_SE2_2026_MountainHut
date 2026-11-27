// A menu as it is stored.
export interface StoredMenu {
  slotId: number;
  text: string;
  updatedAt: Date;
}

// A menu with the date and times of its slot.
export interface StoredMenuWithSlot extends StoredMenu {
  date: string;
  startTime: string;
  endTime: string;
}

// Storage of the menus, one for each slot at most.
export abstract class MenusRepository {
  // Creates the menu of the slot, or replaces its text. null if the slot does not exist.
  abstract save(slotId: number, text: string): Promise<StoredMenu | null>;

  // null if the slot has no menu, or does not exist.
  abstract findBySlot(slotId: number): Promise<StoredMenu | null>;

  abstract slotExists(slotId: number): Promise<boolean>;

  // The different menu texts written so far, each with the latest slot that uses it: latest slot
  // first, at most `limit`.
  abstract findPrevious(limit: number): Promise<StoredMenuWithSlot[]>;
}
