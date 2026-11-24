import { execFileSync } from 'node:child_process';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { bookingStatus, createSlot, deleteSlot } from '../../fixtures/db.js';

// Spec MH-08: as a hiker, I want to cancel a table booking, so that the hut can make the places
// available to other guests. There are no time constraints: a booking can be cancelled at any time.
// The hiker cancels from "My bookings" (/bookings): Cancel booking, then Cancel booking again in the dialog; a toast says it is done
// and offers Undo. The request leaves when the toast goes away.

interface SlotSummary {
  id: number;
  freeSeats: number;
}

// SQL on the database of the running `docker compose` stack, like fixtures/db.ts.
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

let slotIds: number[] = [];

function slot(seats: number[]): number {
  const id = createSlot(seats);
  slotIds.push(id);
  return id;
}

// A slot with one table that starts in about `hours` hours, hut time, and lasts up to one hour.
function slotStartingIn(hours: number, seats: number): number {
  const start = `date_trunc('minute', now() AT TIME ZONE 'Europe/Rome' + interval '${hours} hours')`;
  const id = Number(
    sql(
      `INSERT INTO slots (date, start_time, end_time)
       VALUES (${start}::date, ${start}::time(0),
               CASE WHEN ${start}::time(0) >= TIME '23:00' THEN TIME '23:59:59'
                    ELSE ${start}::time(0) + interval '1 hour' END) RETURNING id;`,
    ),
  );
  sql(`INSERT INTO slot_tables (slot_id, table_number, seats) VALUES (${id}, 1, ${seats});`);
  slotIds.push(id);
  return id;
}

// A confirmed booking written directly in the database, for a slot too close to be booked
// through the API (MH-01: at least 2 hours before).
function insertBooking(email: string, slotId: number, partySize: number): number {
  const quoted = email.replaceAll("'", "''");
  const id = Number(
    sql(
      `INSERT INTO bookings (hiker_id, slot_id, party_size, status)
       SELECT h.id, ${slotId}, ${partySize}, 'CONFIRMED'
       FROM hikers h JOIN users u ON u.id = h.user_id WHERE u.email = '${quoted}'
       RETURNING id;`,
    ),
  );
  sql(
    `INSERT INTO booking_tables (booking_id, slot_id, table_number, assigned_seats)
     VALUES (${id}, ${slotId}, 1, ${partySize});`,
  );
  return id;
}

test.afterEach(() => {
  slotIds.forEach(deleteSlot);
  slotIds = [];
});

async function book(request: APIRequestContext, slotId: number, partySize: number) {
  const response = await request.post('/api/bookings', { data: { slotId, partySize } });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: number };
}

async function freeSeats(request: APIRequestContext, slotId: number): Promise<number> {
  const response = await request.get('/api/slots');
  expect(response.status()).toBe(200);
  const found = ((await response.json()) as SlotSummary[]).find((s) => s.id === slotId);
  expect(found).toBeDefined();
  return found!.freeSeats;
}

async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}

// Opens "My bookings" and waits for the only booking of the hiker.
async function openMyBookings(page: Page): Promise<void> {
  await page.goto('/bookings');
  await expect(page.locator('.booking-card')).toHaveCount(1);
}

// The cancellation leaves when its Undo toast goes away: closing the toast sends it now.
async function sendCancellation(page: Page): Promise<void> {
  const toast = page.locator('.toast', { hasText: 'Booking cancelled. Seats are free again.' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(toast).toHaveCount(0);
}

const cancelButton = (page: Page) => page.getByRole('button', { name: /^Cancel booking of / });

test.describe('MH-08 Web: cancel a booking', () => {
  test('the hiker cancels a booking from My bookings and its seats are free again', async ({
    page,
    registeredUser,
    loggedInRequest,
  }) => {
    const slotId = slot([4]);
    const booking = await book(loggedInRequest, slotId, 3);
    expect(await freeSeats(loggedInRequest, slotId)).toBe(1);

    await signIn(page, registeredUser);
    await openMyBookings(page);
    await cancelButton(page).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Cancel booking' })).toBeVisible();
    await expect(dialog).toContainText('Are you sure you want to cancel the following booking?');
    await expect(dialog).toContainText('19:00–21:00 · 3 people');

    await dialog.getByRole('button', { name: 'Cancel booking', exact: true }).click();

    await sendCancellation(page);
    await expect.poll(() => bookingStatus(booking.id)).toBe('CANCELLED');
    expect(await freeSeats(loggedInRequest, slotId)).toBe(4);

    await expect(page.getByRole('dialog')).toHaveCount(0);

    // The booking has left the upcoming ones and is among the cancelled ones, without actions.
    await expect(page.getByText('You have no upcoming bookings.')).toBeVisible();
    await page.getByRole('tab', { name: 'Cancelled' }).click();
    const card = page.locator('.booking-card');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Cancelled');
    await expect(card).toContainText('3 people');
    await expect(card.getByRole('button')).toHaveCount(0);
  });

  test('Keep booking and Escape close the dialog without cancelling', async ({
    page,
    registeredUser,
    loggedInRequest,
  }) => {
    const slotId = slot([4]);
    const booking = await book(loggedInRequest, slotId, 2);

    await signIn(page, registeredUser);
    await openMyBookings(page);

    await cancelButton(page).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keep booking' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await cancelButton(page).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Nothing was sent: the booking is still active and still among the upcoming ones.
    expect(bookingStatus(booking.id)).not.toBe('CANCELLED');
    expect(await freeSeats(loggedInRequest, slotId)).toBe(2);
    await page.reload();
    await expect(page.locator('.booking-card')).toHaveCount(1);
    await expect(cancelButton(page)).toBeEnabled();
  });

  test('a booking that starts in about one hour can still be cancelled (no time constraints)', async ({
    page,
    registeredUser,
  }) => {
    const slotId = slotStartingIn(1, 4);
    const bookingId = insertBooking(registeredUser.email, slotId, 2);

    await signIn(page, registeredUser);
    await openMyBookings(page);

    // Inside 48 hours the change of MH-06 is closed, the cancellation is not.
    await expect(page.getByRole('button', { name: /^Modify booking of / })).toBeDisabled();
    await expect(cancelButton(page)).toBeEnabled();

    await cancelButton(page).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel booking', exact: true }).click();
    await sendCancellation(page);
    await expect.poll(() => bookingStatus(bookingId)).toBe('CANCELLED');
  });

  test('a booking already cancelled elsewhere: a toast shows the message of the API', async ({
    page,
    registeredUser,
    loggedInRequest,
  }) => {
    const slotId = slot([4]);
    const booking = await book(loggedInRequest, slotId, 2);

    await signIn(page, registeredUser);
    await openMyBookings(page);
    await cancelButton(page).click();

    // Meanwhile the booking is cancelled from another tab or device.
    expect((await loggedInRequest.post(`/api/bookings/${booking.id}/cancel`)).status()).toBe(200);

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel booking', exact: true }).click();
    await sendCancellation(page);
    await expect(page.getByRole('alert')).toHaveText('This booking is already cancelled');
    await expect.poll(() => bookingStatus(booking.id)).toBe('CANCELLED');
    await expect(page.getByText('You have no upcoming bookings.')).toBeVisible();
  });
});

test.describe('MH-08 Web: cancel a booking, further cases', () => {
  test('with two bookings, only the chosen one is cancelled', async ({
    page,
    registeredUser,
    loggedInRequest,
  }) => {
    const keptSlot = slot([4]);
    const cancelledSlot = slot([4]);
    const kept = await book(loggedInRequest, keptSlot, 2);
    const cancelled = await book(loggedInRequest, cancelledSlot, 3);

    await signIn(page, registeredUser);
    await page.goto('/bookings');
    await expect(page.locator('.booking-card')).toHaveCount(2);

    const target = page.locator('.booking-card', { hasText: '3 people' });
    await target.getByRole('button', { name: /^Cancel booking of / }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('3 people');
    await dialog.getByRole('button', { name: 'Cancel booking', exact: true }).click();
    await sendCancellation(page);
    await expect(dialog).toBeHidden();

    await expect.poll(() => bookingStatus(cancelled.id)).toBe('CANCELLED');
    expect(bookingStatus(kept.id)).not.toBe('CANCELLED');
    expect(await freeSeats(loggedInRequest, cancelledSlot)).toBe(4);
    expect(await freeSeats(loggedInRequest, keptSlot)).toBe(2);

    const upcoming = page.locator('.booking-card');
    await expect(upcoming).toHaveCount(1);
    await expect(upcoming).toContainText('2 people');
    await expect(upcoming.getByRole('button', { name: /^Cancel booking of / })).toBeEnabled();

    await page.getByRole('tab', { name: 'Cancelled' }).click();
    await expect(page.locator('.booking-card')).toHaveCount(1);
    await expect(page.locator('.booking-card')).toContainText('3 people');
  });

  test('the cancellation survives a reload of the page', async ({
    page,
    registeredUser,
    loggedInRequest,
  }) => {
    const booking = await book(loggedInRequest, slot([4]), 2);

    await signIn(page, registeredUser);
    await openMyBookings(page);
    await cancelButton(page).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel booking', exact: true }).click();
    await sendCancellation(page);

    await page.reload();
    await expect(page.getByText('You have no upcoming bookings.')).toBeVisible();
    await page.getByRole('tab', { name: 'Cancelled' }).click();
    await expect(page.locator('.booking-card')).toHaveCount(1);
    await expect.poll(() => bookingStatus(booking.id)).toBe('CANCELLED');
  });
});
