import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
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

function sql(statement: string): string {
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      'psql -v ON_ERROR_STOP=1 -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ],
    { input: statement, encoding: 'utf8' },
  ).trim();
}

function slotWithin48Hours(seats: number[]): number {
  const start = `(now() AT TIME ZONE 'Europe/Rome' + interval '24 hours' + ${randomInt(1800)} * interval '1 second')`;
  const slotId = sql(
    `INSERT INTO slots (date, start_time, end_time)
     VALUES (${start}::date, ${start}::time(0), TIME '23:59') RETURNING id;`,
  );
  if (seats.length > 0) {
    const values = seats.map((s, i) => `(${slotId}, ${i + 1}, ${s})`).join(', ');
    sql(`INSERT INTO slot_tables (slot_id, table_number, seats) VALUES ${values};`);
  }
  const id = Number(slotId);
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

test.describe('MH-06 Black-Box Web UI: Change a booking', () => {
  test('R3: Hiker modifies party size and dietary requirements on an existing booking', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4, 6]);

    await signIn(page, registeredUser);

    // 1. Create an initial booking for 2 guests
    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: chosenSlot.startTime, exact: true }).click();
    await page.getByRole('button', { name: 'Book your table' }).click();

    const bookingDialog = page.getByRole('dialog');
    await expect(bookingDialog).toContainText(/Booking request sent/i);
    await bookingDialog.getByRole('button', { name: 'Got it' }).click();

    // 2. Open booking change / management interface
    await page.goto('/bookings');
    const changeBtn = page.getByRole('button', { name: /Change booking|Edit reservation|Modify/i });
    await expect(changeBtn).toBeVisible();
    await changeBtn.click();

    // 3. Update party size from 2 to 4
    const partyInput = page.getByLabel(/Party size|Guests/i);
    if (await partyInput.isVisible()) {
      await partyInput.fill('4');
    } else {
      // If using stepper buttons
      await page.getByRole('button', { name: /More guests|Add guest/i }).click();
      await page.getByRole('button', { name: /More guests|Add guest/i }).click();
    }

    // 4. Update dietary requirements
    const requirementsField = page.getByLabel(/Requirements|Dietary requirements|Notes/i);
    await requirementsField.fill('1 vegan, 1 severe nut allergy');

    // 5. Submit the booking modification
    await page
      .getByRole('button', { name: /Save changes|Update booking|Confirm changes/i })
      .click();

    // 6. Verify confirmation feedback and updated booking summary
    const confirmation = page.locator('.notice--ok, [role="alert"], [role="dialog"]');
    await expect(confirmation.first()).toContainText(/Booking updated|Changes saved|updated/i);
    await expect(page.locator('body')).toContainText('1 severe nut allergy');
    await expect(page.locator('body')).toContainText(/4 (guests|seats|people)/i);
  });

  test('R3 & R8: Hiker changes date and time slot to another day', async ({
    page,
    registeredUser,
  }) => {
    const slotId1 = slot([4]);
    const slotId2 = slot([6]);

    await signIn(page, registeredUser);

    // Initial booking on slot 1
    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot1 = await chooseDayOf(page, slots, slotId1);
    await page.getByRole('radio', { name: chosenSlot1.startTime, exact: true }).click();
    await page.getByRole('button', { name: 'Book your table' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Got it' }).click();

    // Navigate to change booking
    await page.goto('/bookings');
    await page.getByRole('button', { name: /Change booking|Edit reservation|Modify/i }).click();

    // Select the new slot day and time
    const targetSlot = slots.find((s) => s.id === slotId2)!;
    const dates = [...new Set(slots.map((s) => s.date))].sort((a, b) => a.localeCompare(b));
    await page
      .getByRole('radiogroup', { name: /When are you coming|Date|Day/i })
      .getByRole('radio')
      .nth(dates.indexOf(targetSlot.date))
      .click();

    await page.getByRole('radio', { name: targetSlot.startTime, exact: true }).click();

    // Save changes
    await page
      .getByRole('button', { name: /Save changes|Update booking|Confirm changes/i })
      .click();

    // Verify confirmation and new schedule display
    const confirmation = page.locator('.notice--ok, [role="alert"], [role="dialog"]');
    await expect(confirmation.first()).toContainText(/Booking updated|Changes saved|updated/i);
  });

  test('R5: Disables changes and displays warning when booking is within 48-hour cutoff', async ({
    page,
    registeredUser,
  }) => {
    // Slot starting in ~24 hours is within the 48-hour cutoff
    const imminent48SlotId = slotWithin48Hours([4]);

    await signIn(page, registeredUser);

    // Book the slot in ~24 hours (allowed because > 2h cutoff)
    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, imminent48SlotId);
    await page.getByRole('radio', { name: chosenSlot.startTime, exact: true }).click();
    await page.getByRole('button', { name: 'Book your table' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Got it' }).click();

    // View bookings page
    await page.goto('/bookings');

    // Modification is blocked: button is disabled or cutoff notice is displayed
    const changeBtn = page.getByRole('button', { name: /Change booking|Edit reservation|Modify/i });
    const cutoffNotice = page.locator('.notice, [role="alert"], .badge--locked');

    if (await changeBtn.isVisible()) {
      await expect(changeBtn).toBeDisabled();
    }
    await expect(cutoffNotice.first()).toContainText(/48 hours|cannot be changed|locked/i);
  });

  test('R7: Displays availability error notice when party size exceeds available seats', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4]); // Only 4 seats total

    await signIn(page, registeredUser);

    // Initial booking for 2
    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: chosenSlot.startTime, exact: true }).click();
    await page.getByRole('button', { name: 'Book your table' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Got it' }).click();

    // Attempt to edit booking to 8 guests
    await page.goto('/bookings');
    await page.getByRole('button', { name: /Change booking|Edit reservation|Modify/i }).click();

    const partyInput = page.getByLabel(/Party size|Guests/i);
    if (await partyInput.isVisible()) {
      await partyInput.fill('8');
    } else {
      for (let i = 0; i < 6; i++) {
        await page.getByRole('button', { name: /More guests|Add guest/i }).click();
      }
    }

    await page
      .getByRole('button', { name: /Save changes|Update booking|Confirm changes/i })
      .click();

    // Conflict error message displayed
    const errorNotice = page.locator('.notice--error, [role="alert"]');
    await expect(errorNotice.first()).toBeVisible();
    await expect(errorNotice.first()).toContainText(
      /Insufficient seats|Not enough seats|exceeds capacity/i,
    );
  });

  test('R1: Asks signed-out visitor to log in before modifying reservations', async ({ page }) => {
    await page.goto('/bookings');
    // Unauthenticated user is redirected or prompted to sign in
    await expect(page.getByRole('link', { name: /Log in|Sign in/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Change booking|Save changes/i })).toHaveCount(0);
  });
});

test.describe('MH-06 Black-Box Web UI: Planned Future Scenarios (TODOs)', () => {
  // TODO(MH-06): Test cancel/discard changes reverts form fields without persisting
  test.skip('reverts form fields to previous booking values when user cancels edit', async () => { });

  // TODO(MH-06): Test keyboard accessibility on the booking change modal/form
  test.skip('allows full keyboard navigation through all change booking form fields', async () => { });

  // TODO(MH-06): Test visual diff summary highlighting modified fields before submission
  test.skip('displays clear before and after comparison before final modification confirmation', async () => { });

  // TODO(MH-06): Test screen reader announcement when 48h cutoff restriction is encountered
  test.skip('announces 48h modification deadline warning politely for assistive devices', async () => { });

  // TODO(MH-06): Test real-time seat availability indicator dynamically updating as party size changes
  test.skip('displays live available seat count indicator while hiker adjusts party size', async () => { });
});
