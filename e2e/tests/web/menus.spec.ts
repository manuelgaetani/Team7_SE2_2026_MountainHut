import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { createMenuSlot, deleteSlot, slotStart } from '../../fixtures/db.js';
import { SLOT } from '../../fixtures/slots.js';

interface ListedSlot {
  id: number;
  date: string;
  startTime: string;
}

// Every menu slot is 12:00–14:00 (createMenuSlot), on a random day of its own.
const TIME = '12:00–14:00';

// A menu in the layout the editor writes (apps/web/src/lib/menuFormat.ts), so the pages read
// it back as courses and dishes. The id keeps it unique: the list of previous menus groups equal
// texts on their latest slot, which could be the slot of another test running at the same time.
function editorMenu(): string {
  return [
    '## Primi',
    '',
    '### Polenta concia · € 12',
    '*Polenta with melted cheese*',
    'Marks: Dairy',
    `Slow cooked with **toma** cheese (${randomUUID()})`,
  ].join('\n');
}

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

async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}

// The card of the slot on the staff page, opened on its day.
async function openSlotCard(page: Page, slotId: number): Promise<Locator> {
  await page.goto(`/staff/slots?date=${slotStart(slotId).date}`);
  const card = page.locator('.schedule__slot', { hasText: TIME });
  await expect(card).toBeVisible();
  return card;
}

async function openEditor(page: Page, card: Locator, action: 'Define' | 'Edit'): Promise<Locator> {
  await card.getByRole('button', { name: `${action} the menu of ${TIME}` }).click();
  const dialog = page.getByRole('dialog', { name: `Menu for ${TIME}` });
  await expect(dialog.getByLabel('Start from')).toBeVisible();
  return dialog;
}

// The Close button at the bottom of a dialog; the × at the top has the same name.
const closeButton = (dialog: Locator): Locator =>
  dialog.getByRole('button', { name: 'Close', exact: true }).last();

async function savedText(client: APIRequestContext, slotId: number): Promise<string | null> {
  const res = await client.get(`/api/slots/${slotId}/menu`);
  if (res.status() === 404) return null;
  expect(res.status()).toBe(200);
  return ((await res.json()) as { text: string }).text;
}

async function writeMenu(client: APIRequestContext, slotId: number, text: string): Promise<void> {
  const res = await client.put(`/api/slots/${slotId}/menu`, { data: { text } });
  expect(res.status()).toBe(200);
}

test.describe('MH-10 UI: Define menus', () => {
  test('does not let hikers define menus', async ({ page, registeredUser }) => {
    await signIn(page, registeredUser);
    await page.goto('/staff/slots');
    await expect(page.getByText('This page is for the hut staff.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Define the menu of / })).toHaveCount(0);
  });

  test('employee writes the menu of a slot with a formatted description', async ({
    page,
    employeeUser,
  }) => {
    const slotId = newSlot();
    await signIn(page, employeeUser);
    const card = await openSlotCard(page, slotId);
    const dialog = await openEditor(page, card, 'Define');

    await dialog.getByRole('button', { name: 'Add a dish to Antipasti' }).click();
    await dialog.getByLabel('Name (Italian)').fill('Tagliere di malga');
    await dialog.getByLabel('Name (English)').fill('Mountain board');
    await dialog.getByLabel('Price (€)').fill('9,50');
    await dialog.getByRole('checkbox', { name: 'Dairy' }).check();
    // The description with the formatting of the story: bold, italic, item and sub-item.
    await dialog
      .getByLabel('Description', { exact: true })
      .fill('Cured meats and **alpine** cheeses\n- *Toma*\n  - aged 12 months');
    await dialog.getByRole('button', { name: 'Save menu' }).click();

    await expect(page.getByText(`Menu saved for ${TIME}.`)).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(card.getByRole('button', { name: `Edit the menu of ${TIME}` })).toBeVisible();
    await expect(card).toContainText('Menu · 1 course');

    // The API stores one text: the courses written in the layout of the editor.
    expect(await savedText(page.request, slotId)).toBe(
      [
        '## Antipasti',
        '',
        '### Tagliere di malga · € 9.50',
        '*Mountain board*',
        'Marks: Dairy',
        'Cured meats and **alpine** cheeses',
        '- *Toma*',
        '  - aged 12 months',
      ].join('\n'),
    );
  });

  test('uses the toolbar to format a description', async ({ page, employeeUser }) => {
    const slotId = newSlot();
    await signIn(page, employeeUser);
    const dialog = await openEditor(page, await openSlotCard(page, slotId), 'Define');

    await dialog.getByRole('button', { name: 'Add a dish to Primi' }).click();
    await dialog.getByLabel('Name (Italian)').fill('Canederli');
    await dialog.getByLabel('Name (English)').fill('Bread dumplings');
    await dialog.getByLabel('Price (€)').fill('11');
    const description = dialog.getByLabel('Description', { exact: true });
    await description.fill('In broth');
    await description.selectText();
    await dialog.getByRole('button', { name: 'Bold' }).click();
    await expect(description).toHaveValue('**In broth**');
    await dialog.getByRole('button', { name: 'List item' }).click();
    await expect(description).toHaveValue('- **In broth**');
    await dialog.getByRole('button', { name: 'Save menu' }).click();

    await expect(page.getByText(`Menu saved for ${TIME}.`)).toBeVisible();
    expect(await savedText(page.request, slotId)).toContain('- **In broth**');
  });

  test('shows what needs a fix and saves nothing', async ({ page, employeeUser }) => {
    const slotId = newSlot();
    await signIn(page, employeeUser);
    const dialog = await openEditor(page, await openSlotCard(page, slotId), 'Define');

    // An empty menu.
    await dialog.getByRole('button', { name: 'Save menu' }).click();
    await expect(dialog.getByText('Add at least one dish.')).toBeVisible();

    // A dish without names and with a price of 0.
    await dialog.getByRole('button', { name: 'Add a dish to Secondi' }).click();
    await dialog.getByLabel('Price (€)').fill('0');
    await dialog.getByRole('button', { name: 'Save menu' }).click();
    await expect(dialog.getByText('Enter the name of the dish.')).toBeVisible();
    await expect(dialog.getByText('Enter the English name.')).toBeVisible();
    await expect(dialog.getByText('Enter a price above 0, such as 12 or 9.50.')).toBeVisible();
    await expect(dialog.getByText('Some fields need a fix: see the messages above.')).toBeVisible();

    await expect(dialog).toBeVisible();
    expect(await savedText(page.request, slotId)).toBeNull();
  });

  test('asks before discarding unsaved changes', async ({ page, employeeUser }) => {
    const slotId = newSlot();
    await signIn(page, employeeUser);
    const card = await openSlotCard(page, slotId);
    const dialog = await openEditor(page, card, 'Define');

    await dialog.getByRole('button', { name: 'Add a dish to Dolci' }).click();
    await dialog.getByLabel('Name (Italian)').fill('Strudel');

    await closeButton(dialog).click();
    await expect(dialog.getByText('Discard your changes?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog.getByLabel('Name (Italian)')).toHaveValue('Strudel');

    await closeButton(dialog).click();
    await dialog.getByRole('button', { name: 'Discard' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(card.getByRole('button', { name: `Define the menu of ${TIME}` })).toBeVisible();
    expect(await savedText(page.request, slotId)).toBeNull();
  });

  test('reuses a previous menu and changes it for this slot only', async ({
    page,
    employeeUser,
    employeeRequest,
  }) => {
    const source = newSlot();
    const target = newSlot();
    const menu = editorMenu();
    await writeMenu(employeeRequest, source, menu);

    await signIn(page, employeeUser);
    const dialog = await openEditor(page, await openSlotCard(page, target), 'Define');
    await dialog.getByLabel('Start from').selectOption(String(source));
    await expect(dialog.getByLabel('Name (Italian)')).toHaveValue('Polenta concia');
    await expect(dialog.getByLabel('Price (€)')).toHaveValue('12');

    await dialog.getByLabel('Price (€)').fill('13');
    await dialog.getByRole('button', { name: 'Save menu' }).click();
    await expect(page.getByText(`Menu saved for ${TIME}.`)).toBeVisible();

    expect(await savedText(page.request, target)).toBe(menu.replace('· € 12', '· € 13'));
    // The slot the menu came from keeps its own copy.
    expect(await savedText(page.request, source)).toBe(menu);
  });

  test('opens the saved menu of the slot to change it', async ({
    page,
    employeeUser,
    employeeRequest,
  }) => {
    const slotId = newSlot();
    await writeMenu(employeeRequest, slotId, editorMenu());

    await signIn(page, employeeUser);
    const card = await openSlotCard(page, slotId);
    await expect(card).toContainText('Menu · 1 course');
    const dialog = await openEditor(page, card, 'Edit');
    await expect(dialog.getByLabel('Start from')).toHaveValue('saved');
    await expect(dialog.getByLabel('Course 1')).toHaveValue('Primi');
    await expect(dialog.getByLabel('Name (English)')).toHaveValue('Polenta with melted cheese');

    await dialog.getByLabel('Name (English)').fill('Polenta with toma');
    await dialog.getByRole('button', { name: 'Save menu' }).click();
    await expect(page.getByText(`Menu saved for ${TIME}.`)).toBeVisible();
    expect(await savedText(page.request, slotId)).toContain('*Polenta with toma*');
  });

  test('staff see the menu of a slot as hikers see it', async ({
    page,
    employeeUser,
    employeeRequest,
  }) => {
    const slotId = newSlot();
    await writeMenu(employeeRequest, slotId, editorMenu());

    await signIn(page, employeeUser);
    const card = await openSlotCard(page, slotId);
    await card.getByRole('button', { name: TIME, exact: true }).click();

    const preview = page.getByRole('dialog').filter({ hasText: 'As hikers see it' });
    await expect(preview.getByRole('heading', { name: 'Primi' })).toBeVisible();
    await expect(preview).toContainText('Polenta concia');
    await expect(preview).toContainText('€ 12');
    await expect(preview).toContainText('Polenta with melted cheese');
    await expect(preview.locator('strong', { hasText: 'toma' })).toBeVisible();
    await expect(preview.getByRole('list', { name: 'Legend' })).toBeVisible();

    await closeButton(preview).click();
    await expect(preview).toHaveCount(0);
  });

  test('shows a menu written outside the editor as formatted free text', async ({
    page,
    employeeUser,
    employeeRequest,
  }) => {
    const slotId = newSlot();
    await writeMenu(employeeRequest, slotId, 'Today **polenta**\n- *Canederli*\n  - in broth');

    await signIn(page, employeeUser);
    const card = await openSlotCard(page, slotId);
    await expect(card).toContainText('Menu · free text');
    await card.getByRole('button', { name: TIME, exact: true }).click();

    const preview = page.getByRole('dialog').filter({ hasText: 'As hikers see it' });
    await expect(preview.locator('strong', { hasText: 'polenta' })).toBeVisible();
    await expect(preview.locator('em', { hasText: 'Canederli' })).toBeVisible();
    // The sub-item is a list inside the item.
    const item = preview.getByRole('listitem').filter({ hasText: 'Canederli' });
    await expect(item.getByRole('listitem')).toHaveText('in broth');
    await closeButton(preview).click();

    // The editor cannot open it: it says that saving replaces it.
    const dialog = await openEditor(page, card, 'Edit');
    await expect(
      dialog.getByText(
        "This slot's menu is a free text written outside the editor: saving replaces it.",
      ),
    ).toBeVisible();
  });
});

test.describe('MH-10 UI: Hikers read the menu', () => {
  // Opens Book a table and picks the day and the time of the slot. The list of slots comes from
  // the answer the page rendered, as other tests add and delete slots in parallel.
  async function chooseSlot(page: Page, slotId: number): Promise<void> {
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/slots' && r.ok(),
    );
    await page.goto('/book');
    const slots = (await (await response).json()) as ListedSlot[];
    const slot = slots.find((s) => s.id === slotId);
    expect(slot).toBeDefined();
    const dates = [...new Set(slots.map((s) => s.date))].sort((a, b) => a.localeCompare(b));
    await page
      .getByRole('radiogroup', { name: 'When are you coming?' })
      .getByRole('radio')
      .nth(dates.indexOf(slot!.date))
      .click();
    await page.getByRole('radio', { name: SLOT(slot!.startTime) }).click();
  }

  test('a hiker sees the menu of the chosen slot with the legend', async ({
    page,
    registeredUser,
    employeeRequest,
  }) => {
    const slotId = newSlot();
    await writeMenu(employeeRequest, slotId, editorMenu());

    await signIn(page, registeredUser);
    await chooseSlot(page, slotId);

    const menu = page.getByRole('region', { name: 'Menu' });
    await expect(menu).toContainText(`Served ${TIME}`);
    await expect(menu.getByRole('heading', { name: 'Primi' })).toBeVisible();
    await expect(menu).toContainText('Polenta concia');
    await expect(menu).toContainText('€ 12');
    await expect(menu).toContainText('Polenta with melted cheese');
    await expect(menu.locator('strong', { hasText: 'toma' })).toBeVisible();
    await expect(menu.getByRole('list', { name: 'Legend' })).toBeVisible();
  });

  test('a hiker is told when the menu of a slot is not out yet', async ({
    page,
    registeredUser,
  }) => {
    const slotId = newSlot();
    await signIn(page, registeredUser);
    await chooseSlot(page, slotId);

    const menu = page.getByRole('region', { name: 'Menu' });
    await expect(menu).toContainText('The menu of this slot is not out yet.');
    await expect(menu.getByRole('list', { name: 'Legend' })).toHaveCount(0);
  });
});
