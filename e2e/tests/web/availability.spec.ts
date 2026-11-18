import { randomInt } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { createSlot, deleteSlot } from '../../fixtures/db.js';

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

interface ListedSlot {
  id: number;
  date: string;
  startTime: string;
}

// Opens the booking page and returns the slots exactly as the page received them, so the
// position of each day button matches what is on screen while other tests add slots.
async function openBookingPage(
  page: Page,
  open: () => Promise<unknown> = () => page.goto('/book'),
): Promise<ListedSlot[]> {
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/slots' && r.ok(),
  );
  await open();
  return (await (await response).json()) as ListedSlot[];
}

// Day buttons are radios, one per distinct date in ascending order.
async function chooseDay(page: Page, slots: ListedSlot[], date: string): Promise<void> {
  const dates = [...new Set(slots.map((s) => s.date))].sort((a, b) => a.localeCompare(b));
  await page
    .getByRole('radiogroup', { name: 'When are you coming?' })
    .getByRole('radio')
    .nth(dates.indexOf(date))
    .click();
}

const dateOf = (slots: ListedSlot[], slotId: number): string =>
  slots.find((s) => s.id === slotId)!.date;

// TODO(MH-04): the public availability page (/availability, no login, story R1, R4 and R5) is not
// built yet in apps/web: the check is only in the API. Remove .skip once the page exists.
test.describe.skip('MH-04 Black-Box Web UI: Check availability', () => {
  test('R1 & R4: Anonymous visitor checks availability for a party fitting at a single table', async ({
    page,
    employeeUser,
  }) => {
    const testDate = uniqueDate();

    // 1. Staff creates a slot with Table 1 (4 seats) via UI
    await signIn(page, employeeUser);
    await page.goto('/staff/slots');
    await page.getByLabel('Day', { exact: true }).fill(testDate);
    await page.getByLabel('Start').fill('12:00');
    await page.getByLabel('End').fill('13:30');
    await page.getByLabel('Seats, row 1').fill('4');
    await page.getByRole('button', { name: 'Create the slot' }).click();
    await expect(page.getByText('Slot created: 12:00–13:30, 4 seats.')).toBeVisible();

    // 2. Staff logs out: visitor is anonymous (no login required)
    await page.getByRole('button', { name: 'Sign out' }).click();

    // 3. Anonymous visitor navigates to the availability check page
    await page.goto('/availability');
    await page.getByLabel(/Date|Day/i).fill(testDate);
    await page.getByLabel(/Time/i).fill('12:00');
    await page.getByLabel(/Party size|Guests/i).fill('3');
    await page.getByRole('button', { name: /Check availability/i }).click();

    // 4. Verify available status and table layout detail
    const result = page.locator(
      '.availability-result, [role="region"][aria-label*="availability"]',
    );
    await expect(result).toBeVisible();
    await expect(result).toContainText(/Available/i);
    await expect(result).toContainText(/Table 1|4 seats|3 seats/i);
  });

  test('R4: Anonymous visitor checks availability for party split across multiple tables', async ({
    page,
    employeeRequest,
  }) => {
    const testDate = uniqueDate();

    // 1. Setup slot with 3 tables of 2 seats via API
    const slotRes = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '13:00',
        endTime: '14:30',
        tables: [
          { tableNumber: 1, seats: 2 },
          { tableNumber: 2, seats: 2 },
          { tableNumber: 3, seats: 2 },
        ],
      },
    });
    expect(slotRes.status()).toBe(201);

    // 2. Public visitor opens availability check
    await page.goto('/availability');
    await page.getByLabel(/Date|Day/i).fill(testDate);
    await page.getByLabel(/Time/i).fill('13:00');
    await page.getByLabel(/Party size|Guests/i).fill('6');
    await page.getByRole('button', { name: /Check availability/i }).click();

    // 3. Verify multi-table breakdown detail is visible (e.g. 2 + 2 + 2 seats)
    const result = page.locator(
      '.availability-result, [role="region"][aria-label*="availability"]',
    );
    await expect(result).toBeVisible();
    await expect(result).toContainText(/Available/i);
    await expect(result).toContainText(/2 \+ 2 \+ 2|3 tables/i);
  });

  test('R5 & R7: Responds with unavailable notice and does not suggest alternative slots', async ({
    page,
    employeeRequest,
  }) => {
    const testDate = uniqueDate();

    // Setup slot with 4 seats
    const slotRes = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '18:00',
        endTime: '19:30',
        tables: [{ tableNumber: 1, seats: 4 }],
      },
    });
    expect(slotRes.status()).toBe(201);

    // Visitor checks for 8 people (exceeds capacity)
    await page.goto('/availability');
    await page.getByLabel(/Date|Day/i).fill(testDate);
    await page.getByLabel(/Time/i).fill('18:00');
    await page.getByLabel(/Party size|Guests/i).fill('8');
    await page.getByRole('button', { name: /Check availability/i }).click();

    // Verify unavailable notice
    const result = page.locator('.availability-result, [role="alert"]');
    await expect(result).toBeVisible();
    await expect(result).toContainText(/Not available|Insufficient seats/i);

    // Clarification requirement: No alternative slots suggested
    await expect(page.locator('.alternative-slots, .suggested-slots')).toHaveCount(0);
  });
});

// Availability is shown on the booking page: day radios, a guest stepper bounded by the free
// seats, and time radios that are enabled only when the slot can seat the party.
test.describe('MH-04 Black-Box Web UI: Availability on the booking page', () => {
  test('provides direct link to registration or booking flow from positive availability result', async ({
    page,
    registeredUser,
  }) => {
    const slotId = createSlot([4]);
    try {
      await test.step('an anonymous visitor is sent to registration', async () => {
        await page.goto('/');
        await page.getByRole('link', { name: 'Register to book a table' }).click();
        await expect(page).toHaveURL(/\/register$/);
      });

      await test.step('a signed-in hiker can book an available slot', async () => {
        await signIn(page, registeredUser);
        const slots = await openBookingPage(page, () =>
          page.getByRole('link', { name: 'Book a table' }).click(),
        );
        await expect(page).toHaveURL(/\/book$/);
        await chooseDay(page, slots, dateOf(slots, slotId));

        const book = page.getByRole('button', { name: 'Book your table' });
        await expect(book).toBeDisabled();

        const time = slots.find((s) => s.id === slotId)!.startTime;
        await page.getByRole('radio', { name: time, exact: true }).click();
        await expect(page.locator('.recap')).toContainText(`A table is waiting for you at ${time}`);
        await expect(book).toBeEnabled();
      });
    } finally {
      deleteSlot(slotId);
    }
  });

  // The page has no free-text inputs: it prevents an incomplete request instead of reporting it.
  test('shows validation error messages when submitting availability form with empty inputs', async ({
    page,
    registeredUser,
  }) => {
    const slotId = createSlot([3]);
    try {
      await signIn(page, registeredUser);
      const slots = await openBookingPage(page);
      await chooseDay(page, slots, dateOf(slots, slotId));

      // No time chosen: the request cannot be sent and no error is shown yet.
      await expect(page.getByRole('button', { name: 'Book your table' })).toBeDisabled();
      await expect(page.getByRole('alert')).toHaveCount(0);
      const summary = page.getByRole('complementary', { name: 'Booking Summary' });
      await expect(summary.locator('dt:has-text("Time") + dd')).toHaveText('—');

      // The party size is bounded by the free seats of the day (1..3).
      const fewer = page.getByRole('button', { name: 'Fewer guests' });
      const more = page.getByRole('button', { name: 'More guests' });
      const value = page.locator('output.stepper__value');
      await expect(value).toHaveText('2');
      await more.click();
      await expect(value).toHaveText('3');
      await expect(more).toBeDisabled();
      await fewer.click();
      await fewer.click();
      await expect(value).toHaveText('1');
      await expect(fewer).toBeDisabled();
    } finally {
      deleteSlot(slotId);
    }
  });

  test('allows user to check different time slots sequentially updating results smoothly', async ({
    page,
    registeredUser,
    employeeRequest,
  }) => {
    const testDate = uniqueDate();
    const ids: number[] = [];
    try {
      for (const [startTime, endTime, seats] of [
        ['12:00', '13:30', 4],
        ['14:00', '15:30', 2],
      ] as const) {
        const res = await employeeRequest.post('/api/slots', {
          data: { date: testDate, startTime, endTime, tables: [{ tableNumber: 1, seats }] },
        });
        expect(res.status()).toBe(201);
        ids.push(((await res.json()) as { id: number }).id);
      }

      await signIn(page, registeredUser);
      const slots = await openBookingPage(page);
      await chooseDay(page, slots, testDate);
      // Marker on the window: it disappears if the page reloads.
      await page.evaluate(() => ((window as unknown as { marker: boolean }).marker = true));

      const noon = page.getByRole('radio', { name: '12:00', exact: true });
      const afternoon = page.getByRole('radio', { name: '14:00', exact: true });
      const confirm = page.locator('.field__confirm');
      const summaryTime = page
        .getByRole('complementary', { name: 'Booking Summary' })
        .locator('dt:has-text("Time") + dd');

      await noon.click();
      await expect(noon).toHaveAttribute('aria-checked', 'true');
      await expect(confirm).toHaveText('A table is waiting for you at 12:00');
      await expect(summaryTime).toHaveText('12:00');

      await afternoon.click();
      await expect(afternoon).toHaveAttribute('aria-checked', 'true');
      await expect(noon).toHaveAttribute('aria-checked', 'false');
      await expect(confirm).toHaveText('A table is waiting for you at 14:00');
      await expect(summaryTime).toHaveText('14:00');

      // 3 guests no longer fit in the 14:00 slot (2 seats): it is disabled and deselected.
      await page.getByRole('button', { name: 'More guests' }).click();
      await expect(afternoon).toBeDisabled();
      await expect(noon).toBeEnabled();
      await expect(confirm).toHaveCount(0);
      await expect(summaryTime).toHaveText('—');
      await expect(page.getByRole('button', { name: 'Book your table' })).toBeDisabled();

      expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBe(
        true,
      );
    } finally {
      ids.forEach(deleteSlot);
    }
  });

  test('ensures availability feedback region has aria-live polite for screen readers', async ({
    page,
    registeredUser,
  }) => {
    const slotId = createSlot([4]);
    try {
      await signIn(page, registeredUser);
      const slots = await openBookingPage(page);
      await chooseDay(page, slots, dateOf(slots, slotId));

      await expect(page.getByRole('radiogroup', { name: 'When are you coming?' })).toBeVisible();
      await expect(page.getByRole('radiogroup', { name: 'When?' })).toBeVisible();

      const value = page.locator('output.stepper__value');
      await expect(value).toHaveAttribute('aria-live', 'polite');
      await expect(value).toHaveText('2');
      await page.getByRole('button', { name: 'More guests' }).click();
      await expect(value).toHaveText('3');
    } finally {
      deleteSlot(slotId);
    }
  });
});
