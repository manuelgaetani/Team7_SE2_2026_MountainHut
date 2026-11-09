import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { createSlot, deleteSlot } from '../../fixtures/db.js';

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
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
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
      page.getByRole('link', { name: 'Book a table' }).click(),
    );
    const chosenSlot = await chooseDayOf(page, slots, slotId);

    // Increase party size to 4 guests
    await page.getByRole('button', { name: 'More guests' }).click();
    await page.getByRole('button', { name: 'More guests' }).click();

    // Select time slot
    await page.getByRole('radio', { name: chosenSlot.startTime, exact: true }).click();

    // 1. Add first requirement: 1 vegan, peanut allergy (allergies: yes)
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const firstRow = page
      .locator('.party-requirement-item, [data-testid="requirement-row"]')
      .nth(0);
    await firstRow.getByLabel(/Allerg/i).check();
    await firstRow.getByLabel(/Details|Description|Requirement/i).fill('1 vegan, peanut allergy');

    // 2. Add second requirement: 1 shellfish allergy (allergies: yes)
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const secondRow = page
      .locator('.party-requirement-item, [data-testid="requirement-row"]')
      .nth(1);
    await secondRow.getByLabel(/Allerg/i).check();
    await secondRow.getByLabel(/Details|Description|Requirement/i).fill('1 shellfish allergy');

    // 3. Add third requirement: 2 vegetarians (allergies: no)
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const thirdRow = page
      .locator('.party-requirement-item, [data-testid="requirement-row"]')
      .nth(2);
    // Allergies checkbox left unchecked
    await thirdRow.getByLabel(/Details|Description|Requirement/i).fill('2 vegetarians');

    // Submit booking
    await page.getByRole('button', { name: 'Book your table' }).click();

    // Verify confirmation dialog displays party requirements
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Booking request sent');
    await expect(dialog).toContainText('1 vegan, peanut allergy');
    await expect(dialog).toContainText('1 shellfish allergy');
    await expect(dialog).toContainText('2 vegetarians');

    // Dismiss dialog
    await dialog.getByRole('button', { name: 'Got it' }).click();
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
    await page.getByRole('radio', { name: chosenSlot.startTime, exact: true }).click();

    // Add requirement with allergy checked
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const row = page.locator('.party-requirement-item, [data-testid="requirement-row"]').first();
    await row.getByLabel(/Allerg/i).check();
    await row
      .getByLabel(/Details|Description|Requirement/i)
      .fill('Severe celiac disease (gluten allergy)');

    await page.getByRole('button', { name: 'Book your table' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Booking request sent');
    await expect(dialog).toContainText('Severe celiac disease (gluten allergy)');
    // Allergy indicator / badge visible
    await expect(dialog.getByText(/Allerg|Special care/i)).toBeVisible();
  });

  test('R4: Hiker can remove a requirement row before submitting booking', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: chosenSlot.startTime, exact: true }).click();

    // Add two requirements
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const row1 = page.locator('.party-requirement-item, [data-testid="requirement-row"]').nth(0);
    await row1.getByLabel(/Details|Description|Requirement/i).fill('1 lactose intolerant');

    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();
    const row2 = page.locator('.party-requirement-item, [data-testid="requirement-row"]').nth(1);
    await row2.getByLabel(/Details|Description|Requirement/i).fill('1 vegan');

    // Remove first row
    await row1.getByRole('button', { name: /Remove|Delete/i }).click();

    // Verify row count is now 1 and only "1 vegan" remains
    await expect(
      page.locator('.party-requirement-item, [data-testid="requirement-row"]'),
    ).toHaveCount(1);
    await expect(page.getByLabel(/Details|Description|Requirement/i)).toHaveValue('1 vegan');

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
    await page.getByRole('radio', { name: chosenSlot.startTime, exact: true }).click();

    // Do not add requirements, proceed directly to book
    await page.getByRole('button', { name: 'Book your table' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Booking request sent');
    await dialog.getByRole('button', { name: 'Got it' }).click();
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
    await page.getByRole('radio', { name: chosenSlot.startTime, exact: true }).click();

    // Add empty requirement row
    await page.getByRole('button', { name: /Add.*requirement|Add dietary/i }).click();

    // Try to book
    await page.getByRole('button', { name: 'Book your table' }).click();

    // Validation prevents submission or displays error feedback
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const feedback = page.locator('.field__error, [role="alert"], :invalid');
    await expect(feedback.first()).toBeVisible();
  });

  test('Authentication: Asks a signed-out visitor to sign in before booking', async ({ page }) => {
    await page.goto('/book');
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
    await expect(page.getByText('to book a table')).toBeVisible();
    // Requirements form controls are not accessible when signed out
    await expect(page.getByRole('button', { name: /Add.*requirement/i })).toHaveCount(0);
  });
});

test.describe('MH-05 Black-Box Web UI: Planned Future Scenarios (TODOs)', () => {
  // TODO(MH-05): Test keyboard navigation (Tab, Space, Enter) for dynamically adding and removing requirement rows
  test.skip('allows full keyboard navigation for adding and removing dietary requirement items', async () => { });

  // TODO(MH-05): Test screen reader announcement when an allergy requirement is flagged with special care
  test.skip('ensures screen reader announces special care needed alert when allergy checkbox is toggled', async () => { });

  // TODO(MH-05): Test character count warning when description approaches maximum length
  test.skip('displays visual countdown when requirement description nears maximum length limit', async () => { });

  // TODO(MH-05): Test preserving entered requirements when hiker toggles between different party sizes or time slots
  test.skip('preserves already entered dietary requirements when changing selected time slot on same day', async () => { });

  // TODO(MH-05): Test warning dialog when hiker attempts to navigate away with unsaved party requirements
  test.skip('prompts confirmation when navigating away from booking page with unsubmitted requirements', async () => { });
});