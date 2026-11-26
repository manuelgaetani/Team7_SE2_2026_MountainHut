import { MAX_DB_INT } from '@mountain-hut/shared';
import { loadAppConfig } from '../src/config/app-config.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../src/infrastructure/prisma/transaction-context.js';
import { MenusService, PREVIOUS_MENUS_LIMIT } from '../src/menus/application/menus.service.js';
import { PrismaMenusRepository } from '../src/menus/infrastructure/prisma-menus.repository.js';
import { PrismaSlotsRepository } from '../src/slots/infrastructure/prisma-slots.repository.js';
import { createSlot, resetDatabase } from './integration/database.js';

describe('Menus with PostgreSQL (integration) - MH-10', () => {
  const config = loadAppConfig({ ...process.env, JWT_SECRET: 'int-test-secret' });
  const prisma = new PrismaService(config);
  const context = new TransactionContext(prisma);
  const repo = new PrismaMenusRepository(context);
  const service = new MenusService(repo);

  // The only places that know the shape of a menu: a different menu for each label.
  const defineMenu = (slotId: number, label: string) => service.define(slotId, { text: label });
  const menuRow = (slotId: number, label: string) => ({ slotId, text: label });

  const menuSlotIds = async () =>
    (await prisma.menu.findMany({ orderBy: { slotId: 'asc' } })).map((m) => m.slotId);

  // Deletes a slot as the app does (MH-09): slot_tables has no ON DELETE CASCADE, so the
  // repository removes its bookings and tables before the slot. The menu goes by cascade.
  const slots = new PrismaSlotsRepository(context);
  const deleteSlot = (slotId: number) => slots.deleteSlots([slotId]);

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('storage', () => {
    it('keeps one menu per slot when the menu is written again', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      await defineMenu(slotId, 'First menu');
      await defineMenu(slotId, 'Second menu');

      expect(await menuSlotIds()).toEqual([slotId]);
    });

    it('keeps the creation time and moves the update time when the menu is written again', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      await defineMenu(slotId, 'First menu');
      const before = await prisma.menu.findUniqueOrThrow({ where: { slotId } });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await defineMenu(slotId, 'Second menu');
      const after = await prisma.menu.findUniqueOrThrow({ where: { slotId } });

      expect(after.createdAt).toEqual(before.createdAt);
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    });

    it('returns updatedAt as the ISO 8601 instant stored in the database', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      const menu = await defineMenu(slotId, 'Soup');

      const row = await prisma.menu.findUniqueOrThrow({ where: { slotId } });
      expect(menu.slotId).toBe(slotId);
      expect(menu.updatedAt).toBe(row.updatedAt.toISOString());
    });

    it('gives each slot its own menu', async () => {
      const lunch = await createSlot(prisma, '2031-07-01', '12:00', '14:00', [4]);
      const dinner = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      await defineMenu(lunch, 'Lunch menu');
      await defineMenu(dinner, 'Dinner menu');

      expect(await menuSlotIds()).toEqual([lunch, dinner]);
      expect((await service.findBySlot(lunch)).slotId).toBe(lunch);
      expect((await service.findBySlot(dinner)).slotId).toBe(dinner);
    });
  });

  describe('slots that do not exist', () => {
    it('refuses a menu for a slot that does not exist and stores nothing', async () => {
      await expect(defineMenu(999, 'Soup')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Slot not found',
      });
      expect(await menuSlotIds()).toEqual([]);
    });

    it.each([0, -1, MAX_DB_INT + 1])(
      'answers NOT_FOUND for the id %d, outside the database range, without a database error',
      async (slotId) => {
        await expect(defineMenu(slotId, 'Soup')).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: 'Slot not found',
        });
        await expect(service.findBySlot(slotId)).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: 'Slot not found',
        });
      },
    );

    it('tells a slot without a menu from a slot that does not exist', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      await expect(service.findBySlot(slotId)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'This slot has no menu',
      });
      await expect(service.findBySlot(slotId + 1)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Slot not found',
      });
    });
  });

  describe('database constraints', () => {
    it('allows one menu per slot (primary key on slot_id)', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      await prisma.menu.create({ data: menuRow(slotId, 'First') });

      await expect(prisma.menu.create({ data: menuRow(slotId, 'Second') })).rejects.toThrow();
    });

    it('refuses a menu that points to no slot (foreign key)', async () => {
      await expect(prisma.menu.create({ data: menuRow(999, 'Soup') })).rejects.toThrow();
    });

    it('deletes the menu together with its slot (ON DELETE CASCADE)', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const other = await createSlot(prisma, '2031-07-02', '19:00', '21:00', [4]);
      await defineMenu(slotId, 'Deleted with the slot');
      await defineMenu(other, 'Still here');

      await deleteSlot(slotId);

      expect(await menuSlotIds()).toEqual([other]);
      await expect(service.findBySlot(slotId)).rejects.toMatchObject({
        message: 'Slot not found',
      });
    });
  });

  describe('concurrent writes', () => {
    it('writes for the same slot at the same time all succeed and leave one menu', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      const results = await Promise.allSettled(
        ['Menu A', 'Menu B', 'Menu C', 'Menu D'].map((label) => defineMenu(slotId, label)),
      );

      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(await menuSlotIds()).toEqual([slotId]);
    });
  });

  describe('previous menus to reuse', () => {
    it('is empty when no menu was written yet', async () => {
      await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      expect(await service.listPrevious()).toEqual([]);
    });

    it('returns each menu with the hut-local date and times of its slot', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:30', [4]);
      await defineMenu(slotId, 'Dinner');

      const [previous] = await service.listPrevious();

      expect(previous).toMatchObject({
        slotId,
        date: '2031-07-01',
        startTime: '19:00',
        endTime: '21:30',
      });
    });

    it('lists the latest slot first: by date, then by start time', async () => {
      const early = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const lunch = await createSlot(prisma, '2031-07-03', '12:00', '14:00', [4]);
      const dinner = await createSlot(prisma, '2031-07-03', '19:00', '21:00', [4]);
      // Written in a different order from the slots, so the order cannot come from the writes.
      await defineMenu(dinner, 'Dinner');
      await defineMenu(early, 'Early');
      await defineMenu(lunch, 'Lunch');

      const list = await service.listPrevious();

      expect(list.map((m) => m.slotId)).toEqual([dinner, lunch, early]);
    });

    it(`returns at most ${PREVIOUS_MENUS_LIMIT} menus, the latest ones`, async () => {
      const total = PREVIOUS_MENUS_LIMIT + 2;
      const slotIds: number[] = [];
      for (let day = 1; day <= total; day++) {
        // Consecutive days from 1 July 2031, a different menu each.
        const date = new Date(Date.UTC(2031, 6, day)).toISOString().slice(0, 10);
        const slotId = await createSlot(prisma, date, '19:00', '21:00', [4]);
        await defineMenu(slotId, `Menu of day ${day}`);
        slotIds.push(slotId);
      }

      const list = await service.listPrevious();

      expect(list).toHaveLength(PREVIOUS_MENUS_LIMIT);
      expect(list[0]!.slotId).toBe(slotIds[total - 1]);
      // The two oldest slots are left out.
      expect(list.map((m) => m.slotId)).not.toContain(slotIds[0]);
      expect(list.map((m) => m.slotId)).not.toContain(slotIds[1]);
    });

    it('does not list the menu of a deleted slot', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      await defineMenu(slotId, 'Gone');

      await deleteSlot(slotId);

      expect(await service.listPrevious()).toEqual([]);
    });
  });
});
