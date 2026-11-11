import { randomInt } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { deleteSlot } from '../../fixtures/db.js';

let slotIds: number[] = [];

test.afterEach(() => {
  slotIds.forEach(deleteSlot);
  slotIds = [];
});

function uniqueMondayDate(): string {
  const dayOffset = randomInt(5000, 25000);
  const d = new Date(Date.UTC(2035, 0, 1) + dayOffset * 86_400_000);
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? 1 : (8 - day) % 7;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

test.describe('MH-09 Black-Box Web UI: Repeat a weekly schedule', () => {
  test.describe('Authentication & Access Control', () => {
    test('prompts signed-out visitors to log in before managing or repeating schedules', async ({
      page,
    }) => {
      await page.goto('/staff/slots');
      await expect(page.getByText('with a staff account to manage the time slots')).toBeVisible();
      const loginLink = page.getByRole('link', { name: 'Log in' });
      await expect(loginLink).toBeVisible();
      await expect(loginLink).toHaveAttribute('href', '/login');
      await expect(page.getByRole('button', { name: /Repeat weekly schedule/i })).toHaveCount(0);
    });

    test('forbids standard hikers from viewing staff schedule repetition controls', async ({
      page,
      registeredUser,
    }) => {
      await signIn(page, registeredUser);

      // NavBar must not show staff links
      await expect(page.getByRole('link', { name: 'Time slots' })).toHaveCount(0);

      // Direct URL navigation displays staff-only warning
      await page.goto('/staff/slots');
      await expect(page.getByText('This page is for the hut staff.')).toBeVisible();
      await expect(page.getByRole('button', { name: /Repeat weekly schedule/i })).toHaveCount(0);
    });
  });

  test.describe('Employee Schedule Repetition Workflow', () => {
    test('employee configures source day slots and repeats schedule across multiple weeks', async ({
      page,
      employeeUser,
    }) => {
      const monday = uniqueMondayDate();
      const nextMonday = addDays(monday, 7);
      const secondMonday = addDays(monday, 14);

      await signIn(page, employeeUser);

      // 1. Navigate to staff time slots management
      await page.getByRole('link', { name: 'Time slots' }).click();
      await expect(page).toHaveURL('/staff/slots');

      // 2. Select source Monday and create a base slot with 2 tables
      await page.getByLabel('Day').fill(monday);
      await expect(page.getByText('No time slots on this day yet.')).toBeVisible();

      await page.getByLabel('Start').fill('12:00');
      await page.getByLabel('End').fill('13:30');
      await page.getByLabel('Seats, row 1').fill('4');
      await page.getByRole('button', { name: 'Add a table' }).click();
      await page.getByLabel('Seats, row 2').fill('6');
      await page.getByRole('button', { name: 'Create the slot' }).click();

      await expect(page.getByText('Slot created: 12:00–13:30, 10 seats.')).toBeVisible();
      const slotCard = page.locator('.schedule__slot', { hasText: '12:00–13:30' });
      await expect(slotCard).toContainText('2 tables · 10 seats');

      // 3. Open the "Repeat weekly schedule" interface
      const repeatButton = page.getByRole('button', { name: /Repeat weekly schedule/i });
      await expect(repeatButton).toBeVisible();
      await repeatButton.click();

      // 4. Fill repeat parameters: 2 weeks
      const dialog = page.getByRole('dialog', { name: /Repeat weekly schedule/i });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel(/Number of weeks to repeat/i).fill('2');
      await dialog.getByRole('button', { name: /Confirm and repeat/i }).click();

      // 5. Verify confirmation feedback
      await expect(page.getByText(/Schedule successfully repeated across 2 weeks/i)).toBeVisible();

      // 6. Navigate to Day +7 (next Monday) and verify duplicated slot
      await page.getByLabel('Day').fill(nextMonday);
      const nextWeekCard = page.locator('.schedule__slot', { hasText: '12:00–13:30' });
      await expect(nextWeekCard).toBeVisible();
      await expect(nextWeekCard).toContainText('2 tables · 10 seats');
      await expect(nextWeekCard).toContainText('Table 1 · 4 seats');
      await expect(nextWeekCard).toContainText('Table 2 · 6 seats');

      // 7. Navigate to Day +14 (second Monday) and verify duplicated slot
      await page.getByLabel('Day').fill(secondMonday);
      const secondWeekCard = page.locator('.schedule__slot', { hasText: '12:00–13:30' });
      await expect(secondWeekCard).toBeVisible();
      await expect(secondWeekCard).toContainText('2 tables · 10 seats');
    });

    test('warden also has staff access to repeat weekly schedule interface', async ({
      page,
      wardenUser,
    }) => {
      await signIn(page, wardenUser);

      await page.getByRole('link', { name: 'Time slots' }).click();
      await expect(page).toHaveURL('/staff/slots');
      await expect(page.getByRole('button', { name: /Repeat weekly schedule/i })).toBeVisible();
    });
  });

  test.describe('Form Validation & Error States', () => {
    test('displays validation error when entering 0 or negative weeks to repeat', async ({
      page,
      employeeUser,
    }) => {
      const monday = uniqueMondayDate();
      await signIn(page, employeeUser);

      await page.goto('/staff/slots');
      await page.getByLabel('Day').fill(monday);

      // Create a slot first so repetition is possible
      await page.getByLabel('Start').fill('12:00');
      await page.getByLabel('End').fill('13:30');
      await page.getByLabel('Seats, row 1').fill('4');
      await page.getByRole('button', { name: 'Create the slot' }).click();
      await expect(page.getByText('Slot created: 12:00–13:30, 4 seats.')).toBeVisible();

      // Open repeat dialog
      await page.getByRole('button', { name: /Repeat weekly schedule/i }).click();
      const dialog = page.getByRole('dialog', { name: /Repeat weekly schedule/i });

      // Enter invalid weeks (0)
      const weeksInput = dialog.getByLabel(/Number of weeks to repeat/i);
      await weeksInput.fill('0');
      await dialog.getByRole('button', { name: /Confirm and repeat/i }).click();

      await expect(dialog.getByText(/Must be at least 1 week/i)).toBeVisible();
    });
  });

  test.describe('MH-09 Planned Future Scenarios (TODOs)', () => {
    // TODO(MH-09): Full keyboard accessibility (focus trapping and Esc key) in repeat schedule modal
    test.skip('traps focus within repeat schedule dialog and closes on Escape key', async () => {});

    // TODO(MH-09): Conflict preview dialog showing visual timeline of overlapping slots before confirming repetition
    test.skip('displays visual conflict preview warning when target weeks contain pre-existing slots', async () => {});

    // TODO(MH-09): Screen reader ARIA live announcement on completion of multi-week schedule replication
    test.skip('announces summary of created slots via aria-live region upon successful repetition', async () => {});

    // TODO(MH-09): Visual progress indicator for large bulk schedule generation
    test.skip('displays loading spinner with role="status" while bulk slots are being generated', async () => {});

    // TODO(MH-09): Undo action pill in confirmation toast to revert bulk schedule creation
    test.skip('provides an Undo button in toast notification allowing staff to immediately revert repetition', async () => {});
  });
});
