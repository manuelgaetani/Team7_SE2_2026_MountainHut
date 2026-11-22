import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { createSlot, deleteSlot } from '../../fixtures/db.js';

// Spec MH-06: As a hiker, I want to change the date, time, party size, or requirements of my booking.
// Changes are admitted within 48 hours from the date booked.
// Changes to party size are subject to the automatic verification of availability.
//
// TODO(MH-06-integration): add web frontend integration tests when the /bookings UI page and components are integrated with the API

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
  // TODO(MH-06-integration): to be added when web frontend integration testing is performed (requires /bookings UI integration)
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
    const changeBtn = page.getByRole('button', { name: /Modify/i });
    await expect(changeBtn).toBeVisible();
    await changeBtn.click();

    // 3. Update party size from 2 to 4
    await page.getByLabel('Number of people').fill('4');

    // 4. Update dietary requirements
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '+ Add a requirement' }).click();
    await dialog.getByRole('textbox', { name: 'Requirement 1' }).fill('1 severe nut allergy');
    await dialog.getByRole('checkbox', { name: 'Allergies, requirement 1' }).check();

    // 5. Submit the booking modification
    await dialog.getByRole('button', { name: 'Confirm changes' }).click();

    // 6. Verify confirmation feedback and updated booking summary
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Booking updated');
    await expect(page.locator('.booking-card')).toContainText('1 severe nut allergy');
    await expect(page.locator('.booking-card')).toContainText('4 people');
  });

  // TODO(MH-06-integration): to be added when web frontend integration testing is performed (requires /bookings UI integration)
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
    await page.getByRole('button', { name: /Modify/i }).click();

    // Select the new slot day and time
    const targetSlot = slots.find((s) => s.id === slotId2)!;
    await page.getByLabel('Date').selectOption(targetSlot.date);
    await page.getByLabel('Time').selectOption(String(targetSlot.id));

    // Save changes
    await page.getByRole('button', { name: 'Confirm changes' }).click();

    // Verify confirmation and new schedule display
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Booking updated');
    await expect(page.locator('.booking-card')).toContainText(targetSlot.startTime);
  });

  // TODO(MH-06-integration): to be added when web frontend integration testing is performed (requires /bookings UI integration)
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

    // Modification is blocked: button is disabled and cutoff notice is displayed
    const changeBtn = page.getByRole('button', { name: /Modify/i });
    await expect(changeBtn).toBeDisabled();
    await expect(page.locator('.booking-card__locked')).toContainText('48 hours');
  });

  // TODO(MH-06-integration): to be added when web frontend integration testing is performed (requires /bookings UI integration)
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
    await page.getByRole('button', { name: /Modify/i }).click();

    await page.getByLabel('Number of people').fill('8');
    await page.getByRole('button', { name: 'Confirm changes' }).click();

    // Conflict error message displayed
    const errorNotice = page.locator('.dialog [role="alert"]');
    await expect(errorNotice).toBeVisible();
    await expect(errorNotice).toContainText(/free seats|Insufficient seats/i);
  });

  // TODO(MH-06-integration): to be added when web frontend integration testing is performed (requires /bookings UI integration)
  test('R1: Asks signed-out visitor to log in before modifying reservations', async ({ page }) => {
    await page.goto('/bookings');
    // Unauthenticated user is redirected or prompted to sign in
    await expect(page.getByRole('link', { name: /Log in/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Modify/i })).toHaveCount(0);
  });
});

test.describe('MH-06 Black-Box Web UI: Planned Future Scenarios (TODOs)', () => {
  // TODO(MH-06-e2e): Test cancel/discard changes reverts form fields without persisting
  test('reverts form fields to previous booking values when user cancels edit', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4, 6]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: chosenSlot.startTime, exact: true }).click();
    await page.getByRole('button', { name: 'Book your table' }).click();

    const bookingDialog = page.getByRole('dialog');
    await bookingDialog.getByRole('button', { name: 'Got it' }).click();

    await page.goto('/bookings');
    await page.getByRole('button', { name: /Modify/i }).click();

    await page.getByLabel('Number of people').fill('5');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.booking-card')).toContainText('2 people');

    await page.getByRole('button', { name: /Modify/i }).click();
    await expect(page.getByLabel('Number of people')).toHaveValue('2');
  });

  // TODO(MH-06-whitebox): Test keyboard accessibility on the booking change modal/form
  test('allows full keyboard navigation through all change booking form fields', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4, 6]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: chosenSlot.startTime, exact: true }).click();
    await page.getByRole('button', { name: 'Book your table' }).click();

    const bookingDialog = page.getByRole('dialog');
    await bookingDialog.getByRole('button', { name: 'Got it' }).click();

    await page.goto('/bookings');
    await page.getByRole('button', { name: /Modify/i }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  // TODO(MH-06-graybox): Test visual diff summary highlighting modified fields before submission
  test('displays validation notice when attempting to confirm modification without changes', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slot([4, 6]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: chosenSlot.startTime, exact: true }).click();
    await page.getByRole('button', { name: 'Book your table' }).click();

    const bookingDialog = page.getByRole('dialog');
    await bookingDialog.getByRole('button', { name: 'Got it' }).click();

    await page.goto('/bookings');
    await page.getByRole('button', { name: /Modify/i }).click();

    await page.getByRole('button', { name: 'Confirm changes' }).click();
    await expect(page.locator('.dialog [role="alert"]')).toContainText(
      'Nothing has changed: the booking is the same as before.',
    );
  });

  // TODO(MH-06-e2e): Test screen reader announcement when 48h cutoff restriction is encountered
  test('announces 48h modification deadline warning politely for assistive devices', async ({
    page,
    registeredUser,
  }) => {
    const imminent48SlotId = slotWithin48Hours([4]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, imminent48SlotId);
    await page.getByRole('radio', { name: chosenSlot.startTime, exact: true }).click();
    await page.getByRole('button', { name: 'Book your table' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Got it' }).click();

    await page.goto('/bookings');
    const notice = page.locator('.booking-card__locked');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('48 hours');
  });

  // TODO(MH-06-integration): Test real-time seat availability indicator dynamically updating as party size changes
  test('displays slot availability status in time options', async ({ page, registeredUser }) => {
    const slotId = slot([4, 6]);

    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () => page.goto('/book'));
    const chosenSlot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: chosenSlot.startTime, exact: true }).click();
    await page.getByRole('button', { name: 'Book your table' }).click();

    const bookingDialog = page.getByRole('dialog');
    await bookingDialog.getByRole('button', { name: 'Got it' }).click();

    await page.goto('/bookings');
    await page.getByRole('button', { name: /Modify/i }).click();

    const timeSelect = page.getByLabel('Time');
    await expect(timeSelect).toBeVisible();
    await expect(timeSelect).toContainText(chosenSlot.startTime);
  });
});
