import { Injectable } from '@nestjs/common';
import type { DefineMenuInput, PreviousMenu, SlotMenu } from '@mountain-hut/shared';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { MenusRepository } from './menus.repository.port.js';
import type { StoredMenu } from './menus.repository.port.js';

// How many previous menus the staff can choose from when they reuse one.
export const PREVIOUS_MENUS_LIMIT = 50;

const toSlotMenu = (menu: StoredMenu): SlotMenu => ({
  slotId: menu.slotId,
  text: menu.text,
  updatedAt: menu.updatedAt.toISOString(),
});

// MH-10: the staff write the menu of a slot, so that hikers know what the hut serves.
@Injectable()
export class MenusService {
  constructor(private readonly repo: MenusRepository) {}

  // Creates the menu of the slot, or replaces it. Reusing a previous menu is the same request:
  // the web app sends its text, changed or not.
  async define(slotId: number, input: DefineMenuInput): Promise<SlotMenu> {
    const menu = await this.repo.save(slotId, input.text);
    if (!menu) throw new DomainError('NOT_FOUND', 'Slot not found');
    return toSlotMenu(menu);
  }

  async findBySlot(slotId: number): Promise<SlotMenu> {
    const menu = await this.repo.findBySlot(slotId);
    if (menu) return toSlotMenu(menu);
    // Two different answers, so the web app can tell a wrong slot from a slot without a menu.
    if (!(await this.repo.slotExists(slotId))) {
      throw new DomainError('NOT_FOUND', 'Slot not found');
    }
    throw new DomainError('NOT_FOUND', 'This slot has no menu');
  }

  // The menus already written, without repeating the same text: the latest slot first.
  async listPrevious(): Promise<PreviousMenu[]> {
    const menus = await this.repo.findPrevious(PREVIOUS_MENUS_LIMIT);
    return menus.map((m) => ({
      ...toSlotMenu(m),
      date: m.date,
      startTime: m.startTime,
      endTime: m.endTime,
    }));
  }
}
