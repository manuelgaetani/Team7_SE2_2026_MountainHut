import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { MenusRepository } from './menus.repository.port.js';
import type { StoredMenu, StoredMenuWithSlot } from './menus.repository.port.js';
import { MenusService, PREVIOUS_MENUS_LIMIT } from './menus.service.js';

// MH-10 white box: the use cases of the menus. Define (R1, R4, R8), read for the hikers (R7, R9)
// and the previous menus to start from (R4). The repository is a mock.

const updatedAt = new Date('2026-11-26T09:30:00.000Z');
const formatted = '## Primi\n\n### Polenta concia · € 12\n*Polenta with cheese*\nMarks: Dairy';

const storedMenu = (overrides: Partial<StoredMenu> = {}): StoredMenu => ({
  slotId: 12,
  text: formatted,
  updatedAt,
  ...overrides,
});

const previousMenu = (overrides: Partial<StoredMenuWithSlot> = {}): StoredMenuWithSlot => ({
  ...storedMenu(),
  date: '2026-11-28',
  startTime: '12:00',
  endTime: '14:00',
  ...overrides,
});

describe('MenusService', () => {
  let service: MenusService;
  const repo = {
    save: vi.fn(),
    findBySlot: vi.fn(),
    slotExists: vi.fn(),
    findPrevious: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [MenusService, { provide: MenusRepository, useValue: repo }],
    }).compile();
    service = module.get(MenusService);
  });

  it('offers at most 50 previous menus', () => {
    expect(PREVIOUS_MENUS_LIMIT).toBe(50);
  });

  describe('define', () => {
    it('saves the text of the slot and answers the menu with an ISO date', async () => {
      repo.save.mockResolvedValue(storedMenu());
      await expect(service.define(12, { text: formatted })).resolves.toEqual({
        slotId: 12,
        text: formatted,
        updatedAt: '2026-11-26T09:30:00.000Z',
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledWith(12, formatted);
    });

    it('passes the text exactly as written: spaces, new lines and asterisks are formatting', async () => {
      const text = '  - **Polenta**\r\n\t- *with cheese*  \n';
      repo.save.mockResolvedValue(storedMenu({ text }));
      const menu = await service.define(12, { text });
      expect(repo.save).toHaveBeenCalledWith(12, text);
      expect(menu.text).toBe(text);
    });

    it('answers the menu the repository stored, not the input (replacing an existing one)', async () => {
      // A concurrent write may have won: the answer is what the database holds.
      repo.save.mockResolvedValue(storedMenu({ text: 'The other write' }));
      await expect(service.define(12, { text: 'My write' })).resolves.toMatchObject({
        text: 'The other write',
      });
    });

    it('throws NOT_FOUND "Slot not found" when the slot does not exist', async () => {
      repo.save.mockResolvedValue(null);
      const error = await service.define(999, { text: 'Soup' }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: 'NOT_FOUND', message: 'Slot not found' });
    });

    it('lets a repository failure through unchanged', async () => {
      const failure = new Error('connection lost');
      repo.save.mockRejectedValue(failure);
      await expect(service.define(12, { text: 'Soup' })).rejects.toBe(failure);
    });
  });

  describe('findBySlot', () => {
    it('answers the menu of the slot without checking the slot again', async () => {
      repo.findBySlot.mockResolvedValue(storedMenu());
      await expect(service.findBySlot(12)).resolves.toEqual({
        slotId: 12,
        text: formatted,
        updatedAt: '2026-11-26T09:30:00.000Z',
      });
      expect(repo.findBySlot).toHaveBeenCalledWith(12);
      expect(repo.slotExists).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND "This slot has no menu" when the slot exists without a menu', async () => {
      repo.findBySlot.mockResolvedValue(null);
      repo.slotExists.mockResolvedValue(true);
      const error = await service.findBySlot(12).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: 'NOT_FOUND', message: 'This slot has no menu' });
      expect(repo.slotExists).toHaveBeenCalledWith(12);
    });

    it('throws NOT_FOUND "Slot not found" when the slot does not exist', async () => {
      repo.findBySlot.mockResolvedValue(null);
      repo.slotExists.mockResolvedValue(false);
      const error = await service.findBySlot(999).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: 'NOT_FOUND', message: 'Slot not found' });
      expect(repo.slotExists).toHaveBeenCalledWith(999);
    });
  });

  describe('listPrevious', () => {
    it('asks the repository for at most PREVIOUS_MENUS_LIMIT menus', async () => {
      repo.findPrevious.mockResolvedValue([]);
      await service.listPrevious();
      expect(repo.findPrevious).toHaveBeenCalledWith(PREVIOUS_MENUS_LIMIT);
    });

    it('answers an empty list when no menu was written yet', async () => {
      repo.findPrevious.mockResolvedValue([]);
      await expect(service.listPrevious()).resolves.toEqual([]);
    });

    it('answers each menu with its slot, keeping the order of the repository', async () => {
      repo.findPrevious.mockResolvedValue([
        previousMenu(),
        previousMenu({
          slotId: 7,
          text: 'Soup',
          updatedAt: new Date('2026-11-20T08:00:00.000Z'),
          date: '2026-11-22',
          startTime: '19:00',
          endTime: '21:00',
        }),
      ]);
      await expect(service.listPrevious()).resolves.toEqual([
        {
          slotId: 12,
          text: formatted,
          updatedAt: '2026-11-26T09:30:00.000Z',
          date: '2026-11-28',
          startTime: '12:00',
          endTime: '14:00',
        },
        {
          slotId: 7,
          text: 'Soup',
          updatedAt: '2026-11-20T08:00:00.000Z',
          date: '2026-11-22',
          startTime: '19:00',
          endTime: '21:00',
        },
      ]);
    });
  });
});
