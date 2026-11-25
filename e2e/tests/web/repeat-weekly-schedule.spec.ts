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

// A repeat replaces whole target weeks, so MH-09 uses its own range of years (2200-2580), far
// from the dates of the other suites. Random weeks keep parallel tests apart.
function uniqueMondayDate(): string {
  // 2200-01-06 is a Monday.
  const monday = Date.UTC(2200, 0, 6) + randomInt(0, 20_000) * 7 * 86_400_000;
  return new Date(monday).toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}

test.describe('MH-09 Black-Box Web UI: Repeat a weekly schedule', () => {
  test.describe('Authentication & Access Control', () => {
    test('prompts signed-out visitors to log in before managing or repeating schedules', async ({
      page,
    }) => {
      await page.goto('/staff/slots');
      const notice = page.getByText('with a staff account to manage the time slots');
      await expect(notice).toBeVisible();
      const loginLink = notice.getByRole('link', { name: 'Sign in' });
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
      await expect(
        page.getByRole('navigation').getByRole('link', { name: 'Time slots' }),
      ).toHaveCount(0);

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
      await page.getByRole('navigation').getByRole('link', { name: 'Time slots' }).click();
      await expect(page).toHaveURL('/staff/slots');

      // 2. Select source Monday and create a base slot with 2 tables
      // The day is opened by its address: the test dates are decades ahead.
      await page.goto(`/staff/slots?date=${monday}`);
      await expect(page.getByText('No time slots on this day yet.')).toBeVisible();

      await page.getByLabel('Start').fill('12:00');
      await page.getByLabel('End').fill('13:30');
      await page.getByLabel('Seats, row 1').fill('4');
      await page.getByRole('button', { name: 'Add a table' }).click();
      await page.getByLabel('Seats, row 2').fill('6');
      const created = page.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/slots' && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Create the slot' }).click();
      const createdRes = await created;
      expect(createdRes.status()).toBe(201);
      slotIds.push(((await createdRes.json()) as { id: number }).id);

      await expect(page.getByText('Slot created: 12:00–13:30, 10 seats.')).toBeVisible();
      const slotCard = page.locator('.schedule__slot', { hasText: '12:00–13:30' });
      await expect(slotCard).toContainText('2 tables · 0/10 seats taken');

      // 3. Open the "Repeat weekly schedule" interface
      const repeatButton = page.getByRole('button', { name: /Repeat weekly schedule/i });
      await expect(repeatButton).toBeVisible();
      await repeatButton.click();

      // 4. Fill repeat parameters: 2 weeks
      const dialog = page.getByRole('dialog', { name: /Repeat weekly schedule/i });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel(/Number of weeks to repeat/i).fill('2');
      const repeated = page.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/slots/repeat-weekly',
      );
      await dialog
        .getByRole('button', { name: /^(Repeat schedule|Replace \d+ slots? and repeat)$/ })
        .click();
      const repeatedRes = await repeated;
      expect(repeatedRes.status()).toBe(201);
      const repeat = (await repeatedRes.json()) as { createdSlots: { id: number }[] };
      slotIds.push(...repeat.createdSlots.map((slot) => slot.id));

      // 5. Verify confirmation feedback
      await expect(page.getByText(/Schedule successfully repeated across 2 weeks/i)).toBeVisible();

      // 6. Navigate to Day +7 (next Monday) and verify duplicated slot
      // The day is opened by its address: the test dates are decades ahead.
      await page.goto(`/staff/slots?date=${nextMonday}`);
      const nextWeekCard = page.locator('.schedule__slot', { hasText: '12:00–13:30' });
      await expect(nextWeekCard).toBeVisible();
      await expect(nextWeekCard).toContainText('2 tables · 0/10 seats taken');
      await expect(nextWeekCard).toContainText('Table 1 · 4 seats');
      await expect(nextWeekCard).toContainText('Table 2 · 6 seats');

      // 7. Navigate to Day +14 (second Monday) and verify duplicated slot
      // The day is opened by its address: the test dates are decades ahead.
      await page.goto(`/staff/slots?date=${secondMonday}`);
      const secondWeekCard = page.locator('.schedule__slot', { hasText: '12:00–13:30' });
      await expect(secondWeekCard).toBeVisible();
      await expect(secondWeekCard).toContainText('2 tables · 0/10 seats taken');
    });

    test('warden also has staff access to repeat weekly schedule interface', async ({
      page,
      wardenUser,
    }) => {
      await signIn(page, wardenUser);

      await page.getByRole('navigation').getByRole('link', { name: 'Time slots' }).click();
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
      // The day is opened by its address: the test dates are decades ahead.
      await page.goto(`/staff/slots?date=${monday}`);

      // Create a slot first so repetition is possible
      await page.getByLabel('Start').fill('12:00');
      await page.getByLabel('End').fill('13:30');
      await page.getByLabel('Seats, row 1').fill('4');
      const created = page.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/slots' && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Create the slot' }).click();
      const createdRes = await created;
      expect(createdRes.status()).toBe(201);
      slotIds.push(((await createdRes.json()) as { id: number }).id);
      await expect(page.getByText('Slot created: 12:00–13:30, 4 seats.')).toBeVisible();

      // Open repeat dialog
      await page.getByRole('button', { name: /Repeat weekly schedule/i }).click();
      const dialog = page.getByRole('dialog', { name: /Repeat weekly schedule/i });

      // Enter invalid weeks (0)
      const weeksInput = dialog.getByLabel(/Number of weeks to repeat/i);
      await weeksInput.fill('0');
      await dialog
        .getByRole('button', { name: /^(Repeat schedule|Replace \d+ slots? and repeat)$/ })
        .click();

      await expect(dialog.getByText(/Must be at least 1 week/i)).toBeVisible();
    });

    test('warns that the slots already in the target weeks are replaced', async ({
      page,
      employeeUser,
    }) => {
      await signIn(page, employeeUser);
      await page.goto('/staff/slots');
      await page.getByRole('button', { name: /Repeat weekly schedule/i }).click();
      const dialog = page.getByRole('dialog', { name: /Repeat weekly schedule/i });
      await expect(dialog).toContainText(/replaced/i);
    });

    test('explains why a week with reservations cannot be replaced (409)', async ({
      page,
      employeeUser,
    }) => {
      const monday = uniqueMondayDate();
      await signIn(page, employeeUser);
      await page.route('**/api/slots/repeat-weekly', (route) =>
        route.fulfill({
          status: 409,
          json: {
            message: `The week starting ${addDays(monday, 7)} has reservations: its schedule cannot be replaced`,
          },
        }),
      );
      await page.goto('/staff/slots');
      // The day is opened by its address: the test dates are decades ahead.
      await page.goto(`/staff/slots?date=${monday}`);
      await page.getByRole('button', { name: /Repeat weekly schedule/i }).click();
      const dialog = page.getByRole('dialog', { name: /Repeat weekly schedule/i });
      await dialog
        .getByRole('button', { name: /^(Repeat schedule|Replace \d+ slots? and repeat)$/ })
        .click();
      await expect(page.getByRole('alert')).toContainText('has reservations');
    });
  });

  test.describe('Dialog accessibility and feedback', () => {
    // Opens the dialog on a day of the MH-09 range, so a real repeat would touch no other suite.
    async function openRepeatDialog(page: Page, user: TestUser) {
      await signIn(page, user);
      await page.goto('/staff/slots');
      // The day is opened by its address: the test dates are decades ahead.
      await page.goto(`/staff/slots?date=${uniqueMondayDate()}`);
      await page.getByRole('button', { name: /Repeat weekly schedule/i }).click();
      const dialog = page.getByRole('dialog', { name: /Repeat weekly schedule/i });
      await expect(dialog).toBeVisible();
      return dialog;
    }

    test('focuses the number of weeks and closes on Escape key', async ({ page, employeeUser }) => {
      const dialog = await openRepeatDialog(page, employeeUser);

      // The number of weeks is the only thing to choose: it has the focus when the dialog opens.
      await expect(dialog.getByLabel(/Number of weeks to repeat/i)).toBeFocused();

      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    });

    test('disables the confirm button while the slots are being generated', async ({
      page,
      employeeUser,
    }) => {
      // The answer is held back until the pending state has been checked; nothing is written.
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route('**/api/slots/repeat-weekly', async (route) => {
        await held;
        await route.fulfill({
          status: 201,
          json: { targetWeeks: 1, createdSlotsCount: 0, replacedSlotsCount: 0, createdSlots: [] },
        });
      });
      const dialog = await openRepeatDialog(page, employeeUser);

      await dialog
        .getByRole('button', { name: /^(Repeat schedule|Replace \d+ slots? and repeat)$/ })
        .click();

      await expect(dialog.getByRole('button', { name: 'Repeating…' })).toBeDisabled();
      release();
      await expect(dialog).toBeHidden();
    });

    test('announces summary of created slots via a status region upon successful repetition', async ({
      page,
      employeeUser,
    }) => {
      // A stubbed answer: the summary is the point here, so nothing is written to the database.
      await page.route('**/api/slots/repeat-weekly', (route) =>
        route.fulfill({
          status: 201,
          json: { targetWeeks: 2, createdSlotsCount: 6, replacedSlotsCount: 3, createdSlots: [] },
        }),
      );
      const dialog = await openRepeatDialog(page, employeeUser);

      await dialog.getByLabel(/Number of weeks to repeat/i).fill('2');
      await dialog
        .getByRole('button', { name: /^(Repeat schedule|Replace \d+ slots? and repeat)$/ })
        .click();

      await expect(
        page.getByRole('status').filter({ hasText: 'Schedule successfully repeated' }),
      ).toHaveText(
        'Schedule successfully repeated across 2 weeks: 6 slots created. 3 slots replaced.',
      );
    });
  });

  test.describe('Behaviour around the planned scenarios', () => {
    // "Mon 6 Jan", as the dialog writes a date.
    const shortDate = (iso: string): string => {
      const d = new Date(`${iso}T00:00:00Z`);
      const weekday = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
      const month = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
      return `${weekday} ${d.getUTCDate()} ${month}`;
    };

    test('previews the source week and the target weeks before confirming', async ({
      page,
      employeeUser,
    }) => {
      const monday = uniqueMondayDate();
      await signIn(page, employeeUser);
      await page.goto('/staff/slots');
      // The day is opened by its address: the test dates are decades ahead.
      await page.goto(`/staff/slots?date=${monday}`);
      await page.getByRole('button', { name: /Repeat weekly schedule/i }).click();
      const dialog = page.getByRole('dialog', { name: /Repeat weekly schedule/i });

      await expect(dialog).toContainText(`${shortDate(monday)} – ${shortDate(addDays(monday, 6))}`);
      await expect(dialog).toContainText(
        `Target: ${shortDate(addDays(monday, 7))} – ${shortDate(addDays(monday, 13))}`,
      );

      await dialog.getByLabel(/Number of weeks to repeat/i).fill('3');
      await expect(dialog).toContainText(
        `Target: ${shortDate(addDays(monday, 7))} – ${shortDate(addDays(monday, 27))}`,
      );

      // No preview for a number of weeks that cannot be repeated.
      await dialog.getByLabel(/Number of weeks to repeat/i).fill('13');
      await expect(dialog).not.toContainText('Target:');
    });

    test('closing the dialog before confirming copies nothing', async ({ page, employeeUser }) => {
      const monday = uniqueMondayDate();
      await signIn(page, employeeUser);
      await page.goto('/staff/slots');
      // The day is opened by its address: the test dates are decades ahead.
      await page.goto(`/staff/slots?date=${monday}`);

      await page.getByLabel('Start').fill('12:00');
      await page.getByLabel('End').fill('13:30');
      await page.getByLabel('Seats, row 1').fill('4');
      const created = page.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/slots' && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Create the slot' }).click();
      const createdRes = await created;
      expect(createdRes.status()).toBe(201);
      slotIds.push(((await createdRes.json()) as { id: number }).id);

      const repeatRequests: string[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/slots/repeat-weekly') {
          repeatRequests.push(request.method());
        }
      });

      await page.getByRole('button', { name: /Repeat weekly schedule/i }).click();
      const dialog = page.getByRole('dialog', { name: /Repeat weekly schedule/i });
      await dialog.getByLabel(/Number of weeks to repeat/i).fill('2');
      await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
      await expect(dialog).toBeHidden();

      expect(repeatRequests).toEqual([]);
      // The day is opened by its address: the test dates are decades ahead.
      await page.goto(`/staff/slots?date=${addDays(monday, 7)}`);
      await expect(page.getByText('No time slots on this day yet.')).toBeVisible();
    });
  });
});
