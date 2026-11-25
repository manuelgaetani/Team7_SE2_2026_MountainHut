import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { createSlot, deleteSlot } from '../../fixtures/db.js';
import { SLOT } from '../../fixtures/slots.js';

interface ListedSlot {
  id: number;
  date: string;
  startTime: string;
}

let slotIds: number[] = [];

function slot(seats: number[]): number {
  const id = createSlot(seats);
  slotIds.push(id);
  return id;
}

test.afterEach(() => {
  slotIds.forEach(deleteSlot);
  slotIds = [];
});

async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}

async function openBookingPage(page: Page, open: () => Promise<unknown>): Promise<ListedSlot[]> {
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/slots' && r.ok(),
  );
  await open();
  return (await (await response).json()) as ListedSlot[];
}

async function chooseDayOf(page: Page, slots: ListedSlot[], slotId: number): Promise<ListedSlot> {
  const targetSlot = slots.find((s) => s.id === slotId)!;
  const dates = [...new Set(slots.map((s) => s.date))].sort((a, b) => a.localeCompare(b));
  await page
    .getByRole('radiogroup', { name: 'When are you coming?' })
    .getByRole('radio')
    .nth(dates.indexOf(targetSlot.date))
    .click();
  return targetSlot;
}

test.describe('MH-05 Black-Box Web UI: Party Requirements and Allergies', () => {
  test('R1, R2, R4 & R5: Hiker enters multiple party requirements for subsets of party', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4, 4]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () =>
      page.getByRole('navigation').getByRole('link', { name: 'Book a table' }).click(),
    );
    const chosenSlot = await chooseDayOf(page, slots, slotId);

    // Increase party size to 4 guests
    await page.getByRole('button', { name: 'More guests' }).click();
    await page.getByRole('button', { name: 'More guests' }).click();

    // Select time slot
    await page.getByRole('radio', { name: SLOT(chosenSlot.startTime) }).click();

    // 1. Add first requirement: 1 vegan, peanut allergy (allergies: yes)
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const firstRow = page
      .locator('.party-requirement-item, [data-testid="requirement-row"]')
      .nth(0);
    await firstRow.getByRole('checkbox', { name: 'Other', exact: true }).check();
    await firstRow.getByLabel('Other need').fill('1 vegan, peanut allergy');
    await firstRow.getByLabel('Allergy or intolerance').check();

    // 2. Add second requirement: 1 shellfish allergy (allergies: yes)
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const secondRow = page
      .locator('.party-requirement-item, [data-testid="requirement-row"]')
      .nth(1);
    await secondRow.getByRole('checkbox', { name: 'Other', exact: true }).check();
    await secondRow.getByLabel('Other need').fill('1 shellfish allergy');
    await secondRow.getByLabel('Allergy or intolerance').check();

    // 3. Add third requirement: 2 vegetarians (allergies: no)
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const thirdRow = page
      .locator('.party-requirement-item, [data-testid="requirement-row"]')
      .nth(2);
    // Allergies checkbox left unchecked
    await thirdRow.getByRole('checkbox', { name: 'Other', exact: true }).check();
    await thirdRow.getByLabel('Other need').fill('2 vegetarians');

    // Submit booking
    await page.getByRole('button', { name: 'Book your table' }).click();

    // Verify confirmation dialog displays party requirements
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Booking request sent');
    await expect(dialog).toContainText('1 vegan, peanut allergy');
    await expect(dialog).toContainText('1 shellfish allergy');
    await expect(dialog).toContainText('2 vegetarians');

    // Dismiss dialog
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('R3: Hiker specifies a single requirement with allergy flag checked (special care needed)', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: SLOT(chosenSlot.startTime) }).click();

    // Add requirement with allergy checked
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const row = page.locator('.party-requirement-item, [data-testid="requirement-row"]').first();
    await row.getByRole('checkbox', { name: 'Other', exact: true }).check();
    await row.getByLabel('Other need').fill('Severe celiac disease (gluten allergy)');
    await row.getByLabel('Allergy or intolerance').check();

    await page.getByRole('button', { name: 'Book your table' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Booking request sent');
    await expect(dialog).toContainText('Severe celiac disease (gluten allergy)');
    // Allergy indicator / badge visible
    await expect(dialog.getByText(/Allerg|Special care/i)).toBeVisible();
  });

  test('R5: Requirement without allergies does not display allergy warning badge in confirmation dialog', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: SLOT(chosenSlot.startTime) }).click();

    // Add requirement without checking allergies
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const row = page.locator('.party-requirement-item, [data-testid="requirement-row"]').first();
    await row.getByRole('checkbox', { name: 'Other', exact: true }).check();
    await row.getByLabel('Other need').fill('2 vegetarians');

    await page.getByRole('button', { name: 'Book your table' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Booking request sent');
    await expect(dialog).toContainText('2 vegetarians');
    // Allergy warning badge should not be present
    await expect(dialog.getByText(/Special care/i)).toHaveCount(0);
  });

  test('Team 16: Hiker picks the needs from the list of the hut, each named under its icon', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: SLOT(chosenSlot.startTime) }).click();

    await page.getByRole('button', { name: 'Add a requirement' }).click();
    const row = page.getByRole('group', { name: 'Requirement 1' });
    for (const name of [
      'Gluten-free',
      'Lactose-free',
      'Egg-free',
      'Nut-free',
      'Soy-free',
      'Vegan',
      'Vegetarian',
    ]) {
      await expect(row.getByRole('checkbox', { name })).toBeVisible();
    }
    // The free text only appears with Other.
    await expect(row.getByLabel('Other need')).toHaveCount(0);
    await row.getByRole('checkbox', { name: 'Gluten-free' }).check();
    await row.getByRole('checkbox', { name: 'Vegan' }).check();
    await expect(row.getByRole('checkbox', { name: 'Gluten-free' })).toBeChecked();

    await page.getByRole('button', { name: 'Book your table' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Booking request sent');
    await expect(dialog.getByRole('listitem')).toHaveText('AllergiesGluten-freeVegan');
  });

  test('R4: Hiker can remove a requirement row before submitting booking', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: SLOT(chosenSlot.startTime) }).click();

    // Add two requirements
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const row1 = page.locator('.party-requirement-item, [data-testid="requirement-row"]').nth(0);
    await row1.getByRole('checkbox', { name: 'Other', exact: true }).check();
    await row1.getByLabel('Other need').fill('1 lactose intolerant');

    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const row2 = page.locator('.party-requirement-item, [data-testid="requirement-row"]').nth(1);
    await row2.getByRole('checkbox', { name: 'Other', exact: true }).check();
    await row2.getByLabel('Other need').fill('1 vegan');

    // Remove first row
    await row1.getByRole('button', { name: /Remove|Delete/i }).click();

    // Verify row count is now 1 and only "1 vegan" remains
    await expect(
      page.locator('.party-requirement-item, [data-testid="requirement-row"]'),
    ).toHaveCount(1);
    await expect(page.getByLabel('Other need')).toHaveValue('1 vegan');

    await page.getByRole('button', { name: 'Book your table' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Booking request sent');
    await expect(dialog).toContainText('1 vegan');
    await expect(dialog).not.toContainText('1 lactose intolerant');
  });

  test('R6: Hiker submits booking without adding any party requirements', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: SLOT(chosenSlot.startTime) }).click();

    // Do not add requirements, proceed directly to book
    await page.getByRole('button', { name: 'Book your table' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Booking request sent');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('R7: Submitting an added requirement row with empty description displays inline validation feedback', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: SLOT(chosenSlot.startTime) }).click();

    // Add empty requirement row
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();

    // Try to book
    await page.getByRole('button', { name: 'Book your table' }).click();

    // Validation prevents submission or displays error feedback
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const feedback = page.locator('.field__error, [role="alert"], :invalid');
    await expect(feedback.first()).toBeVisible();
  });

  test('R7: Entering requirement description exceeding 500 characters displays validation error', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: SLOT(chosenSlot.startTime) }).click();

    // Add requirement with description > 500 characters
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const row = page.locator('.party-requirement-item, [data-testid="requirement-row"]').first();
    await row.getByRole('checkbox', { name: 'Other', exact: true }).check();
    await row.getByLabel('Other need').fill('A'.repeat(501));

    // Try to book
    await page.getByRole('button', { name: 'Book your table' }).click();

    // Validation prevents submission or displays error feedback
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const feedback = page.locator('.field__error, [role="alert"], :invalid');
    await expect(feedback.first()).toBeVisible();
  });

  test('Authentication: Asks a signed-out visitor to sign in before booking', async ({ page }) => {
    await page.goto('/book');
    await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('to book a table')).toBeVisible();
    // Requirements form controls are not accessible when signed out
    await expect(page.getByRole('button', { name: /Add.*requirement/i })).toHaveCount(0);
  });
});

test.describe('MH-05 Black-Box Web UI: Planned Future Scenarios (TODOs)', () => {
  // TODO(MH-05): Test keyboard navigation (Tab, Space, Enter) for dynamically adding and removing requirement rows
  test.skip('allows full keyboard navigation for adding and removing dietary requirement items', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4]);
    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: SLOT(chosenSlot.startTime) }).click();

    // Focus on "Add requirement" button and activate via keyboard Enter
    const addButton = page.getByRole('button', { name: /Add.*requirement|Add dietary/i });
    await addButton.focus();
    await page.keyboard.press('Enter');

    const firstRow = page
      .locator('.party-requirement-item, [data-testid="requirement-row"]')
      .first();
    await expect(firstRow).toBeVisible();

    // Tab into checkbox and toggle with Space
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await expect(firstRow.getByLabel('Allergy or intolerance')).toBeChecked();

    // Tab into description input and type details
    await page.keyboard.press('Tab');
    await page.keyboard.type('1 peanut allergy');
    await expect(firstRow.getByLabel('Other need')).toHaveValue('1 peanut allergy');

    // Tab into remove button and press Enter to remove
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(
      page.locator('.party-requirement-item, [data-testid="requirement-row"]'),
    ).toHaveCount(0);
  });

  // TODO(MH-05): Test screen reader announcement when an allergy requirement is flagged with special care
  test.skip('ensures screen reader announces special care needed alert when allergy checkbox is toggled', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4]);
    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: SLOT(chosenSlot.startTime) }).click();

    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const row = page.locator('.party-requirement-item, [data-testid="requirement-row"]').first();

    // Toggle allergy checkbox
    await row.getByLabel('Allergy or intolerance').check();

    // Verify accessible live region communicates safety notification for screen readers
    const liveRegion = page.locator('[aria-live="polite"], [role="status"]');
    await expect(liveRegion.filter({ hasText: /special care|allergy/i })).toBeVisible();
  });

  // TODO(MH-05): Test character count warning when description approaches maximum length
  test.skip('displays visual countdown when requirement description nears maximum length limit', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4]);
    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: SLOT(chosenSlot.startTime) }).click();

    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const row = page.locator('.party-requirement-item, [data-testid="requirement-row"]').first();
    const input = row.getByLabel('Other need');

    // Fill 480 characters (nearing 500 characters maximum boundary)
    await input.fill('A'.repeat(480));

    // Visual countdown badge should display remaining allowed characters
    const counter = row.locator('.char-counter, [data-testid="char-counter"]');
    await expect(counter).toBeVisible();
    await expect(counter).toContainText(/20/);
  });

  // TODO(MH-05): Test preserving entered requirements when hiker toggles between different party sizes or time slots
  test.skip('preserves already entered dietary requirements when changing selected time slot on same day', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4, 4]);
    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: SLOT(chosenSlot.startTime) }).click();

    // Add requirement details
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const row = page.locator('.party-requirement-item, [data-testid="requirement-row"]').first();
    await row.getByRole('checkbox', { name: 'Other', exact: true }).check();
    await row.getByLabel('Other need').fill('1 vegan, peanut allergy');
    await row.getByLabel('Allergy or intolerance').check();

    // Change party size
    await page.getByRole('button', { name: 'More guests' }).click();

    // The previously entered requirement must remain intact
    await expect(row.getByLabel('Allergy or intolerance')).toBeChecked();
    await expect(row.getByLabel('Other need')).toHaveValue('1 vegan, peanut allergy');
  });

  // TODO(MH-05): Test warning dialog when hiker attempts to navigate away with unsaved party requirements
  test.skip('prompts confirmation when navigating away from booking page with unsubmitted requirements', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4]);
    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: SLOT(chosenSlot.startTime) }).click();

    // Fill in requirement
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const row = page.locator('.party-requirement-item, [data-testid="requirement-row"]').first();
    await row.getByRole('checkbox', { name: 'Other', exact: true }).check();
    await row.getByLabel('Other need').fill('1 shellfish allergy');

    // Setup beforeunload dialog listener
    let dialogAppeared = false;
    page.on('dialog', async (dialog) => {
      dialogAppeared = true;
      await dialog.dismiss();
    });

    // Attempt navigating away by clicking navbar logo/home link
    await page.getByRole('link', { name: 'Mountain Hut' }).click();
    expect(dialogAppeared).toBe(true);
  });

  // TODO(MH-04): When merged with story MH-04 (Check availability), add full E2E flow from availability check to booking with party requirements
  test.skip('When merged with MH-04: Hiker checks availability first, then proceeds to booking and specifies party requirements and allergies', async () => {});
});
