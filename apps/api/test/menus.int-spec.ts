import { MAX_DB_INT, MENU_ERRORS } from '@mountain-hut/shared';
import { loadAppConfig } from '../src/config/app-config.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../src/infrastructure/prisma/transaction-context.js';
import { MenusService, PREVIOUS_MENUS_LIMIT } from '../src/menus/application/menus.service.js';
import { PrismaMenusRepository } from '../src/menus/infrastructure/prisma-menus.repository.js';
import { PrismaSlotsRepository } from '../src/slots/infrastructure/prisma-slots.repository.js';
import { createSlot, resetDatabase } from './integration/database.js';

// Every formatting of the story: bold, italic, item list and sub items.
// The slot of the time tests: 12:00 at the hut is 10:00 UTC in summer and 11:00 UTC in winter.
const SUMMER_SLOT = ['2031-07-01', '12:00', '14:00'] as const;
const SUMMER_START = new Date('2031-07-01T10:00:00.000Z');
const WINTER_SLOT = ['2031-12-01', '12:00', '14:00'] as const;
const WINTER_START = new Date('2031-12-01T11:00:00.000Z');
const before = (start: Date) => new Date(start.getTime() - 1);

const FORMATTED_MENU = [
  '**Dinner**',
  '- *Polenta* with cheese',
  '  - gluten free on request',
  '- Apple strudel',
  '',
  'Wine: **Nebbiolo**  ',
].join('\n');

describe('Menus with PostgreSQL (integration) - MH-10', () => {
  const config = loadAppConfig({ ...process.env, JWT_SECRET: 'int-test-secret' });
  const prisma = new PrismaService(config);
  const context = new TransactionContext(prisma);
  const repo = new PrismaMenusRepository(context);
  const service = new MenusService(repo, config);
  const slots = new PrismaSlotsRepository(context);

  const defineMenu = (slotId: number, text: string) => service.define(slotId, { text });

  const menuSlotIds = async () =>
    (await prisma.menu.findMany({ orderBy: { slotId: 'asc' } })).map((m) => m.slotId);

  // As the app does: slot_tables has no ON DELETE CASCADE, the repository removes them first.
  const deleteSlot = (slotId: number) => slots.deleteSlots([slotId]);

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('storage', () => {
    it('stores the text exactly as written: new lines, indentation and asterisks', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      const menu = await defineMenu(slotId, FORMATTED_MENU);

      expect(menu).toEqual({ slotId, text: FORMATTED_MENU, updatedAt: expect.any(String) });
      const row = await prisma.menu.findUniqueOrThrow({ where: { slotId } });
      expect(row.text).toBe(FORMATTED_MENU);
    });

    it('keeps accents, symbols and emoji as written', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const text = 'Crème brûlée – 5 € 🍮\nKäsespätzle';

      await defineMenu(slotId, text);

      expect((await service.findBySlot(slotId)).text).toBe(text);
    });

    it('replaces the menu of a slot instead of adding a second one', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      await defineMenu(slotId, 'First menu');
      const replaced = await defineMenu(slotId, 'Second menu');

      expect(replaced.text).toBe('Second menu');
      expect(await menuSlotIds()).toEqual([slotId]);
      expect((await service.findBySlot(slotId)).text).toBe('Second menu');
    });

    it('keeps the creation time and moves the update time when the menu is replaced', async () => {
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
      expect(menu.updatedAt).toBe(row.updatedAt.toISOString());
    });

    it('gives each slot its own menu', async () => {
      const lunch = await createSlot(prisma, '2031-07-01', '12:00', '14:00', [4]);
      const dinner = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      await defineMenu(lunch, 'Lunch menu');
      await defineMenu(dinner, 'Dinner menu');

      expect((await service.findBySlot(lunch)).text).toBe('Lunch menu');
      expect((await service.findBySlot(dinner)).text).toBe('Dinner menu');
    });
  });

  describe('slots that do not exist', () => {
    it('refuses a menu for a slot that does not exist and stores nothing', async () => {
      await expect(defineMenu(999, 'Soup')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: MENU_ERRORS.slotNotFound,
      });
      expect(await menuSlotIds()).toEqual([]);
    });

    it.each([0, -1, MAX_DB_INT + 1])(
      'answers NOT_FOUND for the id %d, outside the database range, without a database error',
      async (slotId) => {
        await expect(defineMenu(slotId, 'Soup')).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: MENU_ERRORS.slotNotFound,
        });
        await expect(service.findBySlot(slotId)).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: MENU_ERRORS.slotNotFound,
        });
      },
    );

    it('tells a slot without a menu from a slot that does not exist', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      await expect(service.findBySlot(slotId)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: MENU_ERRORS.noMenu,
      });
      await expect(service.findBySlot(slotId + 1)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: MENU_ERRORS.slotNotFound,
      });
    });
  });

  describe('database constraints', () => {
    it('allows one menu per slot (primary key on slot_id)', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      await prisma.menu.create({ data: { slotId, text: 'First' } });

      await expect(prisma.menu.create({ data: { slotId, text: 'Second' } })).rejects.toThrow();
    });

    it('refuses a menu that points to no slot (foreign key)', async () => {
      await expect(prisma.menu.create({ data: { slotId: 999, text: 'Soup' } })).rejects.toThrow();
    });

    it('deletes the menu together with its slot (ON DELETE CASCADE)', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const other = await createSlot(prisma, '2031-07-02', '19:00', '21:00', [4]);
      await defineMenu(slotId, 'Deleted with the slot');
      await defineMenu(other, 'Still here');

      await deleteSlot(slotId);

      expect(await menuSlotIds()).toEqual([other]);
      await expect(service.findBySlot(slotId)).rejects.toMatchObject({
        message: MENU_ERRORS.slotNotFound,
      });
    });

    // Why the shared schema refuses "\u0000".
    it('cannot store a NUL character in the text column', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      await expect(repo.save(slotId, 'Soup\u0000')).rejects.toThrow();
      expect(await menuSlotIds()).toEqual([]);
    });
  });

  describe('changing a menu only before the slot starts', () => {
    it('accepts a change up to the last moment before the start', async () => {
      const slotId = await createSlot(prisma, ...SUMMER_SLOT, [4]);
      await defineMenu(slotId, 'First menu');

      await service.define(slotId, { text: 'Second menu' }, before(SUMMER_START));

      expect((await service.findBySlot(slotId)).text).toBe('Second menu');
    });

    it('refuses a change once the slot has started and keeps the menu as it was', async () => {
      const slotId = await createSlot(prisma, ...SUMMER_SLOT, [4]);
      await defineMenu(slotId, 'First menu');

      await expect(
        service.define(slotId, { text: 'Second menu' }, SUMMER_START),
      ).rejects.toMatchObject({ code: 'UNPROCESSABLE', message: MENU_ERRORS.startedChange });
      expect((await service.findBySlot(slotId)).text).toBe('First menu');
    });

    it('reads the start in the time of the hut in winter too (UTC+1)', async () => {
      const slotId = await createSlot(prisma, ...WINTER_SLOT, [4]);

      await service.define(slotId, { text: 'Soup' }, before(WINTER_START));
      await expect(service.define(slotId, { text: 'Stew' }, WINTER_START)).rejects.toMatchObject({
        code: 'UNPROCESSABLE',
      });
      expect((await service.findBySlot(slotId)).text).toBe('Soup');
    });

    it('changing a reused menu changes only the menu of that slot', async () => {
      const monday = await createSlot(prisma, '2031-07-07', '19:00', '21:00', [4]);
      const tuesday = await createSlot(prisma, '2031-07-08', '19:00', '21:00', [4]);
      await defineMenu(monday, FORMATTED_MENU);
      await defineMenu(tuesday, FORMATTED_MENU);

      await defineMenu(tuesday, `${FORMATTED_MENU}\n- Coffee`);

      expect((await service.findBySlot(monday)).text).toBe(FORMATTED_MENU);
      expect((await service.findBySlot(tuesday)).text).toBe(`${FORMATTED_MENU}\n- Coffee`);
    });
  });

  describe('deleting a menu', () => {
    it('deletes the menu of a future slot, not the same menu of other slots', async () => {
      const monday = await createSlot(prisma, '2031-07-07', '19:00', '21:00', [4]);
      const tuesday = await createSlot(prisma, '2031-07-08', '19:00', '21:00', [4]);
      await defineMenu(monday, 'Weekly menu');
      await defineMenu(tuesday, 'Weekly menu');

      await service.remove(tuesday);

      expect(await menuSlotIds()).toEqual([monday]);
      await expect(service.findBySlot(tuesday)).rejects.toMatchObject({
        message: MENU_ERRORS.noMenu,
      });
    });

    it('refuses to delete the menu once the slot has started and keeps it', async () => {
      const slotId = await createSlot(prisma, ...SUMMER_SLOT, [4]);
      await defineMenu(slotId, 'Soup');

      await expect(service.remove(slotId, SUMMER_START)).rejects.toMatchObject({
        code: 'UNPROCESSABLE',
        message: MENU_ERRORS.startedDelete,
      });
      expect((await service.findBySlot(slotId)).text).toBe('Soup');
    });
  });

  describe('concurrent writes', () => {
    it('writes for the same slot at the same time all succeed and leave one of the texts', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const texts = ['Menu A', 'Menu B', 'Menu C', 'Menu D'];

      const results = await Promise.allSettled(texts.map((text) => defineMenu(slotId, text)));

      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(await menuSlotIds()).toEqual([slotId]);
      expect(texts).toContain((await service.findBySlot(slotId)).text);
    });
  });

  describe('previous menus to reuse', () => {
    it('is empty when no menu was written yet', async () => {
      await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);

      expect(await service.listPrevious()).toEqual([]);
    });

    it('returns each menu with the hut-local date and times of its slot', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:30', [4]);
      await defineMenu(slotId, FORMATTED_MENU);

      const [previous] = await service.listPrevious();

      expect(previous).toEqual({
        slotId,
        text: FORMATTED_MENU,
        updatedAt: expect.any(String),
        date: '2031-07-01',
        startTime: '19:00',
        endTime: '21:30',
      });
    });

    it('lists the latest slot first: by date, then by start time', async () => {
      const early = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const lunch = await createSlot(prisma, '2031-07-03', '12:00', '14:00', [4]);
      const dinner = await createSlot(prisma, '2031-07-03', '19:00', '21:00', [4]);
      // Written in another order, so the order cannot come from the writes.
      await defineMenu(dinner, 'Dinner');
      await defineMenu(early, 'Early');
      await defineMenu(lunch, 'Lunch');

      const list = await service.listPrevious();

      expect(list.map((m) => m.slotId)).toEqual([dinner, lunch, early]);
    });

    it('lists the same text once, with the latest slot that uses it', async () => {
      const first = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const second = await createSlot(prisma, '2031-07-08', '19:00', '21:00', [4]);
      const other = await createSlot(prisma, '2031-07-05', '19:00', '21:00', [4]);
      await defineMenu(second, 'Weekly menu');
      await defineMenu(first, 'Weekly menu');
      await defineMenu(other, 'Other menu');

      const list = await service.listPrevious();

      expect(list.map((m) => [m.text, m.slotId])).toEqual([
        ['Weekly menu', second],
        ['Other menu', other],
      ]);
    });

    it('treats a changed text as a different menu', async () => {
      const first = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      const second = await createSlot(prisma, '2031-07-02', '19:00', '21:00', [4]);
      await defineMenu(first, '- Soup');
      await defineMenu(second, '- **Soup**');

      const list = await service.listPrevious();

      expect(list.map((m) => m.text)).toEqual(['- **Soup**', '- Soup']);
    });

    it('shows the replaced text, not the old one', async () => {
      const slotId = await createSlot(prisma, '2031-07-01', '19:00', '21:00', [4]);
      await defineMenu(slotId, 'Old');
      await defineMenu(slotId, 'New');

      expect((await service.listPrevious()).map((m) => m.text)).toEqual(['New']);
    });

    it(`returns at most ${PREVIOUS_MENUS_LIMIT} menus, the latest ones`, async () => {
      const total = PREVIOUS_MENUS_LIMIT + 2;
      const slotIds: number[] = [];
      for (let day = 1; day <= total; day++) {
        const date = new Date(Date.UTC(2031, 6, day)).toISOString().slice(0, 10);
        const slotId = await createSlot(prisma, date, '19:00', '21:00', [4]);
        await defineMenu(slotId, `Menu of day ${day}`);
        slotIds.push(slotId);
      }

      const list = await service.listPrevious();

      expect(list).toHaveLength(PREVIOUS_MENUS_LIMIT);
      expect(list[0]!.slotId).toBe(slotIds[total - 1]);
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
