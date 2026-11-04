import { randomInt } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';

function uniqueDate(): string {
  const dayOffset = randomInt(5000, 25000);
  const d = new Date(Date.UTC(2035, 0, 1) + dayOffset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

test.describe('MH-02 UI: Time slots and table capacity management', () => {
  test('asks a signed-out visitor to log in before managing slots', async ({ page }) => {
    await page.goto('/staff/slots');
    await expect(page.getByText('with a staff account to manage the time slots')).toBeVisible();
    const loginLink = page.getByRole('link', { name: 'Log in' });
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute('href', '/login');
    await expect(page.getByLabel('Day')).toHaveCount(0);
  });

  test('forbids standard hikers from accessing the staff slots page', async ({
    page,
    registeredUser,
  }) => {
    await signIn(page, registeredUser);

    // NavBar should not have the "Time slots" link for hikers
    await expect(page.getByRole('link', { name: 'Time slots' })).toHaveCount(0);

    // Directly navigating shows the staff-only notice
    await page.goto('/staff/slots');
    await expect(page.getByText('This page is for the hut staff.')).toBeVisible();
    await expect(page.getByLabel('Day')).toHaveCount(0);
  });

  test('employee logs in, sees "Time slots" in nav, and manages slots', async ({
    page,
    employeeUser,
  }) => {
    const testDate = uniqueDate();
    await signIn(page, employeeUser);

    // NavBar shows the staff link
    const slotsLink = page.getByRole('link', { name: 'Time slots' });
    await expect(slotsLink).toBeVisible();
    await slotsLink.click();
    await expect(page).toHaveURL('/staff/slots');

    // Select the isolated test date
    const dayInput = page.getByLabel('Day');
    await dayInput.fill(testDate);
    await expect(page.getByText('No time slots on this day yet.')).toBeVisible();

    // 1. Create a slot with 2 tables: Table 1 (4 seats) and Table 2 (6 seats)
    await page.getByLabel('Start').fill('11:30');
    await page.getByLabel('End').fill('13:00');
    await page.getByLabel('Seats, row 1').fill('4');

    await page.getByRole('button', { name: 'Add a table' }).click();
    await page.getByLabel('Seats, row 2').fill('6');

    await page.getByRole('button', { name: 'Create the slot' }).click();

    // Verify confirmation and display in schedule
    await expect(page.getByText('Slot created: 11:30–13:00, 10 seats.')).toBeVisible();
    const slotCard = page.locator('.schedule__slot', { hasText: '11:30–13:00' });
    await expect(slotCard).toContainText('2 tables · 10 seats');
    await expect(slotCard).toContainText('Table 1 · 4 seats');
    await expect(slotCard).toContainText('Table 2 · 6 seats');

    // 2. Create a slot with 0 tables (mode: later)
    await page.getByLabel('Start').fill('13:00');
    await page.getByLabel('End').fill('14:30');
    await page.getByRole('radio', { name: 'Add them later' }).click();
    await page.getByRole('button', { name: 'Create the slot' }).click();

    await expect(page.getByText('Slot created: 13:00–14:30, 0 seats.')).toBeVisible();
    const emptyCard = page.locator('.schedule__slot', { hasText: '13:00–14:30' });
    await expect(emptyCard).toContainText('0 tables · 0 seats');
    await expect(emptyCard).toContainText('No tables yet: hikers cannot book this slot.');

    // 3. Define tables on the empty slot via DefineTablesForm
    const defineBtn = emptyCard.getByRole('button', {
      name: 'Define the tables of 13:00–14:30',
    });
    await defineBtn.click();

    await expect(page.getByRole('heading', { name: /Tables for 13:00–14:30/ })).toBeVisible();
    await page.getByLabel('Seats, row 1').fill('8');
    await page.getByRole('button', { name: 'Save the tables' }).click();

    await expect(page.getByText('Tables saved for 13:00–14:30, 8 seats.')).toBeVisible();
    await expect(emptyCard).toContainText('1 table · 8 seats');
    await expect(emptyCard).toContainText('Table 1 · 8 seats');

    // 4. Create another slot copying tables from 11:30–13:00
    await page.getByLabel('Start').fill('19:00');
    await page.getByLabel('End').fill('20:30');
    await page.getByRole('radio', { name: 'Copy tables from another slot' }).click();
    await page.getByLabel('Copy the tables of').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Create the slot' }).click();

    await expect(page.getByText('Slot created: 19:00–20:30, 10 seats.')).toBeVisible();
    const copiedCard = page.locator('.schedule__slot', { hasText: '19:00–20:30' });
    await expect(copiedCard).toContainText('2 tables · 10 seats');
  });

  test('warden also has staff access to time slots management', async ({ page, wardenUser }) => {
    await signIn(page, wardenUser);

    await expect(page.getByRole('link', { name: 'Time slots' })).toBeVisible();
    await page.goto('/staff/slots');
    await expect(page.getByText('Time slots and tables')).toBeVisible();
    await expect(page.getByLabel('Day')).toBeVisible();
  });
});
