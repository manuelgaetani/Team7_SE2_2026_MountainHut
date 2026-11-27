import { Injectable, Optional } from '@nestjs/common';
import { MENU_ERRORS } from '@mountain-hut/shared';
import type { DefineMenuInput, PreviousMenu, SlotMenu } from '@mountain-hut/shared';
import { AppConfig, DEFAULT_BOOKING_TIMEZONE } from '../../config/app-config.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { isMenuEditable } from '../domain/menu-policy.js';
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
  private readonly timeZone: string;

  constructor(
    private readonly repo: MenusRepository,
    // Always given in the app (ConfigModule is global). Optional so the use cases can also be
    // built with the repository alone: then the default zone of the hut is used.
    @Optional() config?: AppConfig,
  ) {
    this.timeZone = config?.bookingTimeZone ?? DEFAULT_BOOKING_TIMEZONE;
  }

  // Creates the menu of the slot, or replaces it, before the slot starts. Each slot has its own
  // copy: reusing a previous menu sends its text again, and changing it changes only this slot.
  async define(slotId: number, input: DefineMenuInput, now = new Date()): Promise<SlotMenu> {
    await this.checkEditable(slotId, now, MENU_ERRORS.startedChange);
    const menu = await this.repo.save(slotId, input.text);
    // The slot was deleted meanwhile.
    if (!menu) throw new DomainError('NOT_FOUND', MENU_ERRORS.slotNotFound);
    return toSlotMenu(menu);
  }

  async findBySlot(slotId: number): Promise<SlotMenu> {
    const menu = await this.repo.findBySlot(slotId);
    if (menu) return toSlotMenu(menu);
    // Two different answers, so the web app can tell a wrong slot from a slot without a menu.
    if (!(await this.repo.slotExists(slotId))) {
      throw new DomainError('NOT_FOUND', MENU_ERRORS.slotNotFound);
    }
    throw new DomainError('NOT_FOUND', MENU_ERRORS.noMenu);
  }

  // Deletes the menu of a future slot. The menus of slots that have started stay fixed.
  async remove(slotId: number, now = new Date()): Promise<void> {
    await this.checkEditable(slotId, now, MENU_ERRORS.startedDelete);
    if (!(await this.repo.delete(slotId))) {
      throw new DomainError('NOT_FOUND', MENU_ERRORS.noMenu);
    }
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

  // 404 if the slot does not exist, 422 once it has started.
  private async checkEditable(slotId: number, now: Date, startedMessage: string): Promise<void> {
    const startsAt = await this.repo.findSlotStart(slotId, this.timeZone);
    if (!startsAt) throw new DomainError('NOT_FOUND', MENU_ERRORS.slotNotFound);
    if (!isMenuEditable(startsAt, now)) throw new DomainError('UNPROCESSABLE', startedMessage);
  }
}
