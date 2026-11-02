import { expect, test } from '../../fixtures/auth.js';
import { createSlot, deleteSlot } from '../../fixtures/db.js';

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
