import type { Provider } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MENU_ERRORS } from '@mountain-hut/shared';
import { AppConfig, DEFAULT_BOOKING_TIMEZONE } from '../../config/app-config.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { MenusRepository } from './menus.repository.port.js';
import type { StoredMenu, StoredMenuWithSlot } from './menus.repository.port.js';
import { MenusService, PREVIOUS_MENUS_LIMIT } from './menus.service.js';

// MH-10 white box: the use cases of the menus. Define (R1, R4, R8) and delete, only before the
// slot starts; read for the hikers (R7, R9); the previous menus to start from (R4).
// The repository is a mock; `now` is passed to the service so the tests do not depend on the clock.

const updatedAt = new Date('2026-11-26T09:30:00.000Z');
const formatted = '## Primi\n\n### Polenta concia · € 12\n*Polenta with cheese*\nMarks: Dairy';

// The slot starts at 12:00 in Rome on 5 December 2026 (11:00 UTC).
const startsAt = new Date('2026-12-05T11:00:00.000Z');
const before = new Date('2026-12-05T10:59:00.000Z'); // one minute before the start
const MINUTE = 60_000;

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

const repo = {
  save: vi.fn(),
  findBySlot: vi.fn(),
  slotExists: vi.fn(),
  findSlotStart: vi.fn(),
  delete: vi.fn(),
  findPrevious: vi.fn(),
};

async function build(config?: Partial<AppConfig>): Promise<MenusService> {
  const providers: Provider[] = [MenusService, { provide: MenusRepository, useValue: repo }];
  if (config) providers.push({ provide: AppConfig, useValue: config });
  const module = await Test.createTestingModule({ providers }).compile();
  return module.get(MenusService);
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (e: unknown) => e,
  );
}

describe('MenusService', () => {
  let service: MenusService;

  beforeEach(async () => {
    vi.resetAllMocks();
    // By default the slot exists and starts in the future.
    repo.findSlotStart.mockResolvedValue(startsAt);
    service = await build({ bookingTimeZone: 'Europe/Rome' });
  });

  it('offers at most 50 previous menus', () => {
    expect(PREVIOUS_MENUS_LIMIT).toBe(50);
  });

  describe('time zone of the slot start', () => {
    it('reads the start of the slot in the time zone of the configuration', async () => {
      service = await build({ bookingTimeZone: 'Europe/Zurich' });
      repo.save.mockResolvedValue(storedMenu());
      await service.define(12, { text: formatted }, before);
      expect(repo.findSlotStart).toHaveBeenCalledWith(12, 'Europe/Zurich');
    });

    it('uses the time zone of the hut when there is no configuration', async () => {
      service = await build();
      repo.delete.mockResolvedValue(true);
      await service.remove(12, before);
      expect(repo.findSlotStart).toHaveBeenCalledWith(12, DEFAULT_BOOKING_TIMEZONE);
      expect(DEFAULT_BOOKING_TIMEZONE).toBe('Europe/Rome');
    });
  });

  describe('define', () => {
    it('saves the text of a future slot and answers the menu with an ISO date', async () => {
      repo.save.mockResolvedValue(storedMenu());
      await expect(service.define(12, { text: formatted }, before)).resolves.toEqual({
        slotId: 12,
        text: formatted,
        updatedAt: '2026-11-26T09:30:00.000Z',
      });
      expect(repo.findSlotStart).toHaveBeenCalledWith(12, 'Europe/Rome');
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledWith(12, formatted);
    });

    it('checks the start of the slot before saving', async () => {
      repo.save.mockResolvedValue(storedMenu());
      await service.define(12, { text: formatted }, before);
      expect(repo.findSlotStart.mock.invocationCallOrder[0]).toBeLessThan(
        repo.save.mock.invocationCallOrder[0],
      );
    });

    it('uses the current time when no time is given', async () => {
      // A slot one hour from now is still editable.
      repo.findSlotStart.mockResolvedValue(new Date(Date.now() + 60 * MINUTE));
      repo.save.mockResolvedValue(storedMenu());
      await expect(service.define(12, { text: formatted })).resolves.toMatchObject({
        slotId: 12,
      });
    });

    it('passes the text exactly as written: spaces, new lines and asterisks are formatting', async () => {
      const text = '  - **Polenta**\r\n\t- *with cheese*  \n';
      repo.save.mockResolvedValue(storedMenu({ text }));
      const menu = await service.define(12, { text }, before);
      expect(repo.save).toHaveBeenCalledWith(12, text);
      expect(menu.text).toBe(text);
    });

    it('answers the menu the repository stored, not the input (replacing an existing one)', async () => {
      // A concurrent write may have won: the answer is what the database holds.
      repo.save.mockResolvedValue(storedMenu({ text: 'The other write' }));
      await expect(service.define(12, { text: 'My write' }, before)).resolves.toMatchObject({
        text: 'The other write',
      });
    });

    it('throws NOT_FOUND "Slot not found" without saving when the slot does not exist', async () => {
      repo.findSlotStart.mockResolvedValue(null);
      const error = await errorOf(service.define(999, { text: 'Soup' }, before));
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: 'NOT_FOUND', message: MENU_ERRORS.slotNotFound });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND "Slot not found" when the slot is deleted while saving', async () => {
      repo.save.mockResolvedValue(null);
      const error = await errorOf(service.define(12, { text: 'Soup' }, before));
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: 'NOT_FOUND', message: MENU_ERRORS.slotNotFound });
    });

    it.each([
      ['exactly at the start', 0],
      ['one minute after the start', MINUTE],
    ])('throws UNPROCESSABLE without saving %s', async (_label, offset) => {
      const now = new Date(startsAt.getTime() + offset);
      const error = await errorOf(service.define(12, { text: 'Soup' }, now));
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({
        code: 'UNPROCESSABLE',
        message: 'The slot has already started: its menu cannot be changed',
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('lets a repository failure through unchanged', async () => {
      const failure = new Error('connection lost');
      repo.save.mockRejectedValue(failure);
      await expect(service.define(12, { text: 'Soup' }, before)).rejects.toBe(failure);
    });
  });

  describe('remove', () => {
    it('deletes the menu of a future slot', async () => {
      repo.delete.mockResolvedValue(true);
      await expect(service.remove(12, before)).resolves.toBeUndefined();
      expect(repo.findSlotStart).toHaveBeenCalledWith(12, 'Europe/Rome');
      expect(repo.delete).toHaveBeenCalledWith(12);
    });

    it('uses the current time when no time is given', async () => {
      repo.findSlotStart.mockResolvedValue(new Date(Date.now() + 60 * MINUTE));
      repo.delete.mockResolvedValue(true);
      await expect(service.remove(12)).resolves.toBeUndefined();
    });

    it.each([
      ['exactly at the start', 0],
      ['one minute after the start', MINUTE],
    ])('throws UNPROCESSABLE without deleting %s', async (_label, offset) => {
      const now = new Date(startsAt.getTime() + offset);
      const error = await errorOf(service.remove(12, now));
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({
        code: 'UNPROCESSABLE',
        message: 'The slot has already started: its menu cannot be deleted',
      });
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND "This slot has no menu" when there is nothing to delete', async () => {
      repo.delete.mockResolvedValue(false);
      const error = await errorOf(service.remove(12, before));
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: 'NOT_FOUND', message: MENU_ERRORS.noMenu });
    });

    it('throws NOT_FOUND "Slot not found" without deleting when the slot does not exist', async () => {
      repo.findSlotStart.mockResolvedValue(null);
      const error = await errorOf(service.remove(999, before));
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: 'NOT_FOUND', message: MENU_ERRORS.slotNotFound });
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('findBySlot', () => {
    it('answers the menu of the slot, also for a slot that has started', async () => {
      repo.findBySlot.mockResolvedValue(storedMenu());
      await expect(service.findBySlot(12)).resolves.toEqual({
        slotId: 12,
        text: formatted,
        updatedAt: '2026-11-26T09:30:00.000Z',
      });
      expect(repo.findBySlot).toHaveBeenCalledWith(12);
      // Reading has no time limit, and does not check the slot again.
      expect(repo.findSlotStart).not.toHaveBeenCalled();
      expect(repo.slotExists).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND "This slot has no menu" when the slot exists without a menu', async () => {
      repo.findBySlot.mockResolvedValue(null);
      repo.slotExists.mockResolvedValue(true);
      const error = await errorOf(service.findBySlot(12));
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: 'NOT_FOUND', message: MENU_ERRORS.noMenu });
      expect(repo.slotExists).toHaveBeenCalledWith(12);
    });

    it('throws NOT_FOUND "Slot not found" when the slot does not exist', async () => {
      repo.findBySlot.mockResolvedValue(null);
      repo.slotExists.mockResolvedValue(false);
      const error = await errorOf(service.findBySlot(999));
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toMatchObject({ code: 'NOT_FOUND', message: MENU_ERRORS.slotNotFound });
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
