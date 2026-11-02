import type { Page, PlaywrightWorkerArgs } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { createImminentSlot, createSlot, deleteSlot } from '../../fixtures/db.js';

interface ListedSlot {
  id: number;
  date: string;
  startTime: string;
}
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

// Opens the booking page and returns the slots exactly as the page received them.
// Other tests create and delete slots in parallel: reading the response the page itself
// rendered keeps the position of each day in sync with the day buttons on screen.
async function openBookingPage(page: Page, open: () => Promise<unknown>): Promise<ListedSlot[]> {
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/slots' && r.ok(),
  );
  await open();
  return (await (await response).json()) as ListedSlot[];
}

// Selects the day of the given slot. The day buttons are radios, one per distinct date,
// in ascending order, so the position does not depend on the date format.
async function chooseDayOf(page: Page, slots: ListedSlot[], slotId: number): Promise<ListedSlot> {
  const slot = slots.find((s) => s.id === slotId)!;
  const dates = [...new Set(slots.map((s) => s.date))].sort();
  await page
    .getByRole('radiogroup', { name: 'When are you coming?' })
    .getByRole('radio')
    .nth(dates.indexOf(slot.date))
    .click();
  return slot;
}

// Another hiker books seats through the API, like someone faster than the person on the page.
async function bookAsOtherHiker(
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string | undefined,
  slotId: number,
  partySize: number,
): Promise<void> {
  const client = await playwright.request.newContext({ baseURL });
  const user: TestUser = {
    email: `e2e-${crypto.randomUUID()}@example.test`,
    password: crypto.randomUUID(),
    fullName: 'Other Hiker',
    phone: '+39 333 7654321',
  };
  expect((await client.post('/api/auth/register', { data: user })).status()).toBe(201);
  const login = await client.post('/api/auth/login', {
    data: { email: user.email, password: user.password },
  });
  expect(login.status()).toBe(200);
  const booking = await client.post('/api/bookings', { data: { slotId, partySize } });
  expect(booking.status()).toBe(201);
  await client.dispose();
}

test('a hiker signs in and books a table', async ({ page, registeredUser }) => {
  const slotId = createSlot([2, 4]);
  try {
    await signIn(page, registeredUser);

    const slots = await openBookingPage(page, () =>
      page.getByRole('link', { name: 'Book a table' }).click(),
    );
    const slot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('button', { name: 'More guests' }).click(); // the stepper starts at 2
    await page.getByRole('radio', { name: slot.startTime, exact: true }).click();
    await page.getByRole('button', { name: 'Book your table' }).click();

    // The booking is PENDING: the dialog says it is only a request.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Booking request sent');
    await expect(dialog).toContainText('The booking is not confirmed yet');
    await expect(page.getByText('Table 2 (3 seats)')).toBeVisible();

    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(dialog).toHaveCount(0);
  } finally {
    deleteSlot(slotId);
  }
});

test('asks a signed-out visitor to sign in before booking', async ({ page }) => {
  await page.goto('/book');
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect(page.getByText('to book a table')).toBeVisible();
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
});

test('shows full and closed slots but does not let the hiker choose them', async ({
  page,
  registeredUser,
}) => {
  const full = createSlot([]);
  const closed = createImminentSlot([4]);
  try {
    await signIn(page, registeredUser);
    const slots = await openBookingPage(page, () => page.goto('/book'));

    const fullSlot = await chooseDayOf(page, slots, full);
    await expect(page.getByRole('radio', { name: fullSlot.startTime, exact: true })).toBeDisabled();

    const closedSlot = await chooseDayOf(page, slots, closed);
    const closedRadio = page.getByRole('radio', { name: closedSlot.startTime, exact: true });
    await expect(closedRadio).toBeDisabled();
    await expect(closedRadio).toHaveAttribute('title', 'Bookings closed for this time slot');
  } finally {
    deleteSlot(full);
    deleteSlot(closed);
  }
});

// The page does not let the hiker ask for more than the free seats, so the API error is
// reached when the seats disappear after the page was loaded.
test('explains why a booking fails when the seats were taken meanwhile', async ({
  page,
  registeredUser,
  playwright,
  baseURL,
}) => {
  const slotId = createSlot([2]);
  try {
    await signIn(page, registeredUser);
    const slots = await openBookingPage(page, () => page.goto('/book'));
    const slot = await chooseDayOf(page, slots, slotId);
    await page.getByRole('radio', { name: slot.startTime, exact: true }).click();

    await bookAsOtherHiker(playwright, baseURL, slotId, 2);
    await page.getByRole('button', { name: 'Book your table' }).click();

    await expect(page.getByRole('alert')).toContainText('Insufficient seats available');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    deleteSlot(slotId);
  }
});
