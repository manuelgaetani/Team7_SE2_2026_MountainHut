import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import {
  createImminentSlot,
  createMenuSlot,
  createPastSlot,
  createStartedSlot,
  deleteSlot,
  setMenu,
  slotStart,
} from '../../fixtures/db.js';

interface SlotMenu {
  slotId: number;
  text: string;
  updatedAt: string;
}

interface PreviousMenu extends SlotMenu {
  date: string;
  startTime: string;
  endTime: string;
}

// The largest id a Postgres INTEGER can hold: no slot has it.
const MAX_DB_INT = 2_147_483_647;
const MAX_MENU_LENGTH = 5000;

// The messages of MENU_ERRORS (packages/shared/src/menus.ts).
const SLOT_NOT_FOUND = 'Slot not found';
const NO_MENU = 'This slot has no menu';
const STARTED_CHANGE = 'The slot has already started: its menu cannot be changed';
const STARTED_DELETE = 'The slot has already started: its menu cannot be deleted';

let slotIds: number[] = [];

test.afterEach(() => {
  slotIds.forEach(deleteSlot);
  slotIds = [];
});

function newSlot(): number {
  const id = createMenuSlot();
  slotIds.push(id);
  return id;
}

// A slot whose menu can no longer change: over, or started an hour ago.
function startedSlot(kind: 'past' | 'started'): number {
  const id = kind === 'past' ? createPastSlot([4]) : createStartedSlot([4]);
  slotIds.push(id);
  return id;
}

// A menu with every formatting of the story: bold, italic, list items and sub-items.
// The id keeps the text unique, because the list of previous menus groups equal texts.
function formattedMenu(): string {
  return [
    `**Menu of the day** ${randomUUID()}`,
    '',
    '- *Antipasti*',
    '  - Tagliere di salumi',
    '  - Formaggi di malga',
    '- **Primi**',
    '  - Polenta concia',
  ].join('\n');
}

const defineMenu = (client: APIRequestContext, slotId: number | string, text: unknown) =>
  client.put(`/api/slots/${slotId}/menu`, { data: { text } });

const deleteMenu = (client: APIRequestContext, slotId: number | string) =>
  client.delete(`/api/slots/${slotId}/menu`);

async function readMenu(client: APIRequestContext, slotId: number): Promise<SlotMenu> {
  const res = await client.get(`/api/slots/${slotId}/menu`);
  expect(res.status()).toBe(200);
  return (await res.json()) as SlotMenu;
}

async function messageOf(res: { json: () => Promise<unknown> }): Promise<string> {
  return ((await res.json()) as { message: string }).message;
}

async function previousMenus(client: APIRequestContext): Promise<PreviousMenu[]> {
  const res = await client.get('/api/menus');
  expect(res.status()).toBe(200);
  return (await res.json()) as PreviousMenu[];
}

test.describe('MH-10: Define menus', () => {
  test.describe('Role-based access control', () => {
    test('refuses unauthenticated requests with 401', async ({ request }) => {
      const slotId = newSlot();
      expect((await defineMenu(request, slotId, 'Polenta')).status()).toBe(401);
      expect((await request.get(`/api/slots/${slotId}/menu`)).status()).toBe(401);
      expect((await request.get('/api/menus')).status()).toBe(401);
      expect((await deleteMenu(request, slotId)).status()).toBe(401);
    });

    test('forbids hikers to write, delete or list menus with 403', async ({
      employeeRequest,
      loggedInRequest,
    }) => {
      const slotId = newSlot();
      expect((await defineMenu(employeeRequest, slotId, 'Polenta')).status()).toBe(200);
      expect((await defineMenu(loggedInRequest, slotId, 'Spezzatino')).status()).toBe(403);
      expect((await deleteMenu(loggedInRequest, slotId)).status()).toBe(403);
      expect((await loggedInRequest.get('/api/menus')).status()).toBe(403);
      // The menu written by the staff is untouched.
      expect((await readMenu(employeeRequest, slotId)).text).toBe('Polenta');
    });

    test('lets hikers read the menu of a slot', async ({ employeeRequest, loggedInRequest }) => {
      const slotId = newSlot();
      const text = formattedMenu();
      expect((await defineMenu(employeeRequest, slotId, text)).status()).toBe(200);

      const res = await loggedInRequest.get(`/api/slots/${slotId}/menu`);
      expect(res.status()).toBe(200);
      const menu = (await res.json()) as SlotMenu;
      expect(menu.slotId).toBe(slotId);
      expect(menu.text).toBe(text);
    });

    test('lets the warden write menus as staff', async ({ wardenRequest }) => {
      const slotId = newSlot();
      const res = await defineMenu(wardenRequest, slotId, 'Canederli in brodo');
      expect(res.status()).toBe(200);
      expect(((await res.json()) as SlotMenu).text).toBe('Canederli in brodo');
      expect((await wardenRequest.get('/api/menus')).status()).toBe(200);
    });
  });

  test.describe('Writing the menu of a slot', () => {
    test('saves the menu with its formatting exactly as written', async ({ employeeRequest }) => {
      const slotId = newSlot();
      const text = formattedMenu();

      const res = await defineMenu(employeeRequest, slotId, text);
      expect(res.status()).toBe(200);
      const saved = (await res.json()) as SlotMenu;
      expect(saved.slotId).toBe(slotId);
      // New lines, the indentation of the sub-items and the asterisks are the formatting.
      expect(saved.text).toBe(text);
      expect(Number.isNaN(Date.parse(saved.updatedAt))).toBe(false);

      const read = await employeeRequest.get(`/api/slots/${slotId}/menu`);
      expect(read.status()).toBe(200);
      expect(await read.json()).toEqual(saved);
    });

    test('replaces the menu of the slot on a second write', async ({ employeeRequest }) => {
      const slotId = newSlot();
      const first = (await (
        await defineMenu(employeeRequest, slotId, 'Polenta')
      ).json()) as SlotMenu;

      const res = await defineMenu(employeeRequest, slotId, '- Polenta\n- Spezzatino');
      expect(res.status()).toBe(200);
      const second = (await res.json()) as SlotMenu;
      expect(second.text).toBe('- Polenta\n- Spezzatino');
      expect(Date.parse(second.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt));

      const read = (await (
        await employeeRequest.get(`/api/slots/${slotId}/menu`)
      ).json()) as SlotMenu;
      expect(read.text).toBe('- Polenta\n- Spezzatino');
    });

    test('keeps one of two menus written at the same time', async ({
      employeeRequest,
      wardenRequest,
    }) => {
      const slotId = newSlot();
      const [a, b] = await Promise.all([
        defineMenu(employeeRequest, slotId, 'Menu A'),
        defineMenu(wardenRequest, slotId, 'Menu B'),
      ]);
      expect(a.status()).toBe(200);
      expect(b.status()).toBe(200);

      const read = (await (
        await employeeRequest.get(`/api/slots/${slotId}/menu`)
      ).json()) as SlotMenu;
      expect(['Menu A', 'Menu B']).toContain(read.text);
    });

    test('accepts a menu of exactly the maximum length', async ({ employeeRequest }) => {
      const slotId = newSlot();
      const text = 'a'.repeat(MAX_MENU_LENGTH);
      const res = await defineMenu(employeeRequest, slotId, text);
      expect(res.status()).toBe(200);
      expect(((await res.json()) as SlotMenu).text).toBe(text);
    });
  });

  test.describe('Validation', () => {
    const invalid: [string, unknown][] = [
      ['an empty text', ''],
      ['a text of spaces and new lines only', '  \n\t '],
      ['a text longer than the maximum', 'a'.repeat(MAX_MENU_LENGTH + 1)],
      ['a text with a NUL character', 'Polenta\u0000'],
      ['a text that is not a string', 42],
      ['no text', undefined],
    ];
    for (const [name, text] of invalid) {
      test(`rejects ${name} with 400 and saves nothing`, async ({ employeeRequest }) => {
        const slotId = newSlot();
        const res = await employeeRequest.put(`/api/slots/${slotId}/menu`, {
          data: text === undefined ? {} : { text },
        });
        expect(res.status()).toBe(400);
        expect((await employeeRequest.get(`/api/slots/${slotId}/menu`)).status()).toBe(404);
      });
    }

    test('rejects a slot id that is not a number with 400', async ({ employeeRequest }) => {
      expect((await defineMenu(employeeRequest, 'abc', 'Polenta')).status()).toBe(400);
      expect((await employeeRequest.get('/api/slots/abc/menu')).status()).toBe(400);
    });

    test('answers 404 for a slot that does not exist', async ({ employeeRequest }) => {
      for (const id of [MAX_DB_INT, MAX_DB_INT + 1]) {
        const res = await defineMenu(employeeRequest, id, 'Polenta');
        expect(res.status()).toBe(404);
        expect(((await res.json()) as { message: string }).message).toBe('Slot not found');
      }
    });
  });

  test.describe('Reading the menu of a slot', () => {
    test('tells a slot without a menu from a slot that does not exist', async ({
      loggedInRequest,
    }) => {
      const slotId = newSlot();
      const noMenu = await loggedInRequest.get(`/api/slots/${slotId}/menu`);
      expect(noMenu.status()).toBe(404);
      expect(((await noMenu.json()) as { message: string }).message).toBe('This slot has no menu');

      const noSlot = await loggedInRequest.get(`/api/slots/${MAX_DB_INT}/menu`);
      expect(noSlot.status()).toBe(404);
      expect(((await noSlot.json()) as { message: string }).message).toBe('Slot not found');
    });

    test('deletes the menu with its slot', async ({ employeeRequest }) => {
      const slotId = newSlot();
      const text = formattedMenu();
      expect((await defineMenu(employeeRequest, slotId, text)).status()).toBe(200);

      deleteSlot(slotId);

      const res = await employeeRequest.get(`/api/slots/${slotId}/menu`);
      expect(res.status()).toBe(404);
      expect(((await res.json()) as { message: string }).message).toBe('Slot not found');
      expect((await previousMenus(employeeRequest)).some((m) => m.text === text)).toBe(false);
    });
  });

  test.describe('Changing a menu only before its slot starts', () => {
    for (const kind of ['past', 'started'] as const) {
      test(`refuses to write the menu of a ${kind} slot with 422`, async ({ employeeRequest }) => {
        const slotId = startedSlot(kind);
        const res = await defineMenu(employeeRequest, slotId, 'Polenta');
        expect(res.status()).toBe(422);
        expect(await messageOf(res)).toBe(STARTED_CHANGE);
        expect((await employeeRequest.get(`/api/slots/${slotId}/menu`)).status()).toBe(404);
      });

      test(`keeps the menu of a ${kind} slot as it was written`, async ({
        employeeRequest,
        loggedInRequest,
      }) => {
        const slotId = startedSlot(kind);
        const text = formattedMenu();
        setMenu(slotId, text);

        const res = await defineMenu(employeeRequest, slotId, 'Something else');
        expect(res.status()).toBe(422);
        expect(await messageOf(res)).toBe(STARTED_CHANGE);
        // Still readable by the staff and by the hikers.
        expect((await readMenu(employeeRequest, slotId)).text).toBe(text);
        expect((await readMenu(loggedInRequest, slotId)).text).toBe(text);
      });
    }

    test('lets the staff change the menu of a slot that starts later today', async ({
      employeeRequest,
    }) => {
      // A slot that starts in about an hour: not started yet.
      const slotId = createImminentSlot([4]);
      slotIds.push(slotId);
      expect((await defineMenu(employeeRequest, slotId, 'Polenta')).status()).toBe(200);
      expect((await defineMenu(employeeRequest, slotId, 'Spezzatino')).status()).toBe(200);
      expect((await readMenu(employeeRequest, slotId)).text).toBe('Spezzatino');
    });
  });

  test.describe('Deleting the menu of a slot', () => {
    test('lets the employee delete the menu of a future slot', async ({ employeeRequest }) => {
      const slotId = newSlot();
      expect((await defineMenu(employeeRequest, slotId, formattedMenu())).status()).toBe(200);

      const res = await deleteMenu(employeeRequest, slotId);
      expect(res.status()).toBe(204);
      expect(await res.text()).toBe('');

      const read = await employeeRequest.get(`/api/slots/${slotId}/menu`);
      expect(read.status()).toBe(404);
      expect(await messageOf(read)).toBe(NO_MENU);
    });

    test('lets the warden delete a menu as staff', async ({ employeeRequest, wardenRequest }) => {
      const slotId = newSlot();
      expect((await defineMenu(employeeRequest, slotId, 'Polenta')).status()).toBe(200);
      expect((await deleteMenu(wardenRequest, slotId)).status()).toBe(204);
      expect((await employeeRequest.get(`/api/slots/${slotId}/menu`)).status()).toBe(404);
    });

    test('removes the deleted menu from the previous menus', async ({ employeeRequest }) => {
      const slotId = newSlot();
      const text = formattedMenu();
      expect((await defineMenu(employeeRequest, slotId, text)).status()).toBe(200);
      expect((await deleteMenu(employeeRequest, slotId)).status()).toBe(204);
      expect((await previousMenus(employeeRequest)).some((m) => m.text === text)).toBe(false);
    });

    test('lets the staff write a new menu after deleting one', async ({ employeeRequest }) => {
      const slotId = newSlot();
      expect((await defineMenu(employeeRequest, slotId, 'Polenta')).status()).toBe(200);
      expect((await deleteMenu(employeeRequest, slotId)).status()).toBe(204);
      expect((await defineMenu(employeeRequest, slotId, 'Canederli')).status()).toBe(200);
      expect((await readMenu(employeeRequest, slotId)).text).toBe('Canederli');
    });

    test('answers 404 when the slot has no menu', async ({ employeeRequest }) => {
      const slotId = newSlot();
      const res = await deleteMenu(employeeRequest, slotId);
      expect(res.status()).toBe(404);
      expect(await messageOf(res)).toBe(NO_MENU);
    });

    test('answers 404 when the menu was already deleted', async ({ employeeRequest }) => {
      const slotId = newSlot();
      expect((await defineMenu(employeeRequest, slotId, 'Polenta')).status()).toBe(200);
      expect((await deleteMenu(employeeRequest, slotId)).status()).toBe(204);
      const again = await deleteMenu(employeeRequest, slotId);
      expect(again.status()).toBe(404);
      expect(await messageOf(again)).toBe(NO_MENU);
    });

    test('answers 404 for a slot that does not exist', async ({ employeeRequest }) => {
      for (const id of [MAX_DB_INT, MAX_DB_INT + 1]) {
        const res = await deleteMenu(employeeRequest, id);
        expect(res.status()).toBe(404);
        expect(await messageOf(res)).toBe(SLOT_NOT_FOUND);
      }
    });

    test('rejects a slot id that is not a number with 400', async ({ employeeRequest }) => {
      expect((await deleteMenu(employeeRequest, 'abc')).status()).toBe(400);
    });

    for (const kind of ['past', 'started'] as const) {
      test(`keeps the menu of a ${kind} slot: 422`, async ({ employeeRequest }) => {
        const slotId = startedSlot(kind);
        const text = formattedMenu();
        setMenu(slotId, text);

        const res = await deleteMenu(employeeRequest, slotId);
        expect(res.status()).toBe(422);
        expect(await messageOf(res)).toBe(STARTED_DELETE);
        expect((await readMenu(employeeRequest, slotId)).text).toBe(text);
      });
    }
  });

  test.describe('A menu reused on several slots', () => {
    test('changing it on one slot leaves the others as they were', async ({ employeeRequest }) => {
      const first = newSlot();
      const second = newSlot();
      const text = formattedMenu();
      expect((await defineMenu(employeeRequest, first, text)).status()).toBe(200);
      expect((await defineMenu(employeeRequest, second, text)).status()).toBe(200);

      const changed = `${text}\n- *Dolci*\n  - Strudel`;
      expect((await defineMenu(employeeRequest, second, changed)).status()).toBe(200);

      expect((await readMenu(employeeRequest, first)).text).toBe(text);
      expect((await readMenu(employeeRequest, second)).text).toBe(changed);
    });

    test('deleting it on one slot leaves the others as they were', async ({ employeeRequest }) => {
      const first = newSlot();
      const second = newSlot();
      const text = formattedMenu();
      expect((await defineMenu(employeeRequest, first, text)).status()).toBe(200);
      expect((await defineMenu(employeeRequest, second, text)).status()).toBe(200);

      expect((await deleteMenu(employeeRequest, first)).status()).toBe(204);

      expect((await employeeRequest.get(`/api/slots/${first}/menu`)).status()).toBe(404);
      expect((await readMenu(employeeRequest, second)).text).toBe(text);
      const listed = (await previousMenus(employeeRequest)).filter((m) => m.text === text);
      expect(listed.map((m) => m.slotId)).toEqual([second]);
    });
  });

  test.describe('Reusing previous menus', () => {
    test('lists a menu with the date and times of its slot', async ({ employeeRequest }) => {
      const slotId = newSlot();
      const text = formattedMenu();
      const saved = (await (await defineMenu(employeeRequest, slotId, text)).json()) as SlotMenu;

      const listed = (await previousMenus(employeeRequest)).filter((m) => m.text === text);
      expect(listed).toEqual([
        {
          ...saved,
          date: slotStart(slotId).date,
          startTime: '12:00',
          endTime: '14:00',
        },
      ]);
    });

    test('lists a reused menu once, with its latest slot', async ({ employeeRequest }) => {
      const first = newSlot();
      const second = newSlot();
      const text = formattedMenu();
      expect((await defineMenu(employeeRequest, first, text)).status()).toBe(200);
      // The staff reuse the text of the first slot for the second one.
      expect((await defineMenu(employeeRequest, second, text)).status()).toBe(200);

      const latest = slotStart(first).date > slotStart(second).date ? first : second;
      const listed = (await previousMenus(employeeRequest)).filter((m) => m.text === text);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.slotId).toBe(latest);
      expect(listed[0]?.date).toBe(slotStart(latest).date);
    });

    test('lists a reused and changed menu as a new one', async ({ employeeRequest }) => {
      const first = newSlot();
      const second = newSlot();
      const text = formattedMenu();
      const changed = `${text}\n- *Dolci*\n  - Strudel`;
      expect((await defineMenu(employeeRequest, first, text)).status()).toBe(200);
      expect((await defineMenu(employeeRequest, second, changed)).status()).toBe(200);

      const menus = await previousMenus(employeeRequest);
      expect(menus.find((m) => m.text === text)?.slotId).toBe(first);
      expect(menus.find((m) => m.text === changed)?.slotId).toBe(second);
    });

    test('lists the latest slots first', async ({ employeeRequest }) => {
      const ids = [newSlot(), newSlot(), newSlot()];
      for (const id of ids) {
        expect((await defineMenu(employeeRequest, id, formattedMenu())).status()).toBe(200);
      }

      const menus = await previousMenus(employeeRequest);
      const moments = menus.map((m) => `${m.date}T${m.startTime}`);
      expect(moments).toEqual([...moments].sort().reverse());
      for (const id of ids) {
        expect(menus.some((m) => m.slotId === id)).toBe(true);
      }
    });
  });
});
