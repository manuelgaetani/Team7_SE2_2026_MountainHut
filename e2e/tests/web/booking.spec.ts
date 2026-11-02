import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { createImminentSlot, createSlot, deleteSlot } from '../../fixtures/db.js';

test('a hiker signs in and books a table', async ({ page, registeredUser }) => {
  const slotId = createSlot([2, 4]);
  try {
    await page.goto('/login');
    await page.getByLabel('Email').fill(registeredUser.email);
    await page.getByLabel('Password').fill(registeredUser.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

    await page.getByRole('link', { name: 'Book a table' }).click();
    const response = await page.request.get('/api/slots');
    const slots = (await response.json()) as { id: number; date: string; startTime: string }[];
    const targetSlot = slots.find((s) => s.id === slotId)!;

    // Select the day button corresponding to the slot's date
    const dayNumber = String(Number(targetSlot.date.split('-')[2]));
    const dayButton = page.locator('.picker__day', { hasText: dayNumber });
    if ((await dayButton.count()) > 0) {
      await dayButton.first().click();
    }

    // Default guests is 2; increase to 3
    await page.getByRole('button', { name: 'More guests' }).click();

    // Select the time slot
    await page.getByRole('radio', { name: targetSlot.startTime }).click();

    // Submit booking
    await page.getByRole('button', { name: 'Book your table' }).click();

    // Verify confirmation dialog and seating assignment
    await expect(page.getByRole('dialog')).toContainText('Booking request sent');
    await expect(page.getByText('Table 2 (3 seats)')).toBeVisible();
  } finally {
    deleteSlot(slotId);
  }
});

async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

// Opens the booking page and selects the date of the given slot.
async function chooseDateOf(page: Page, slotId: number): Promise<void> {
  await page.goto('/book');
  const slots = (await (await page.request.get('/api/slots')).json()) as {
    id: number;
    date: string;
  }[];
  await page.getByLabel('Date').selectOption(slots.find((s) => s.id === slotId)!.date);
}

test('asks a signed-out visitor to sign in before booking', async ({ page }) => {
  await page.goto('/book');
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(main).toContainText('to book a table');
  await expect(page.getByLabel('Number of people')).toHaveCount(0);
});

test('shows full and closed slots but does not let the hiker choose them', async ({
  page,
  registeredUser,
}) => {
  const full = createSlot([]);
  const closed = createImminentSlot([4]);
  try {
    await signIn(page, registeredUser);

    await chooseDateOf(page, full);
    const fullOption = page.locator(`#time option[value="${full}"]`);
    await expect(fullOption).toContainText('(full)');
    await expect(fullOption).toBeDisabled();

    await chooseDateOf(page, closed);
    const closedOption = page.locator(`#time option[value="${closed}"]`);
    await expect(closedOption).toContainText('(booking closed)');
    await expect(closedOption).toBeDisabled();
  } finally {
    deleteSlot(full);
    deleteSlot(closed);
  }
});

test('explains why a party that does not fit cannot be booked', async ({
  page,
  registeredUser,
}) => {
  const slotId = createSlot([2]);
  try {
    await signIn(page, registeredUser);
    await chooseDateOf(page, slotId);
    await page.getByLabel('Time').selectOption(String(slotId));
    await page.getByLabel('Number of people').fill('5');
    await page.getByRole('button', { name: 'Book' }).click();

    await expect(page.getByRole('alert')).toContainText('Insufficient seats available');
    await expect(page.getByRole('status')).toHaveCount(0);
  } finally {
    deleteSlot(slotId);
  }
});
