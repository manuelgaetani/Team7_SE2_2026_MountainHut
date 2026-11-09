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

test.describe('MH-04 Black-Box Web UI: Check availability', () => {
  test('R1 & R4: Anonymous visitor checks availability for a party fitting at a single table', async ({
    page,
    employeeUser,
  }) => {
    const testDate = uniqueDate();

    // 1. Staff creates a slot with Table 1 (4 seats) via UI
    await signIn(page, employeeUser);
    await page.goto('/staff/slots');
    await page.getByLabel('Day').fill(testDate);
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

test.describe('MH-04 Black-Box Web UI: Planned Future Scenarios (TODOs)', () => {
  // TODO(MH-04): Test call-to-action button linking from available result to registration or booking
  test.skip('provides direct link to registration or booking flow from positive availability result', async () => {});

  // TODO(MH-04): Test form field validation feedback when submitting with missing date or time in UI
  test.skip('shows validation error messages when submitting availability form with empty inputs', async () => {});

  // TODO(MH-04): Test sequential availability checks for different time slots without page reload
  test.skip('allows user to check different time slots sequentially updating results smoothly', async () => {});

  // TODO(MH-04): Test accessibility and ARIA live attributes on the availability results container
  test.skip('ensures availability feedback region has aria-live polite for screen readers', async () => {});
});
