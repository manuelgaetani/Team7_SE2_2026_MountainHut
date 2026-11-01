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
    const slots = (await response.json()) as { id: number; date: string }[];
    await page.getByLabel('Date').selectOption(slots.find((s) => s.id === slotId)!.date);
    await page.getByLabel('Time').selectOption(String(slotId));
    await page.getByLabel('Number of people').fill('3');
    await page.getByRole('button', { name: 'Book' }).click();

    await expect(page.getByRole('status')).toContainText('Booking confirmed');
    await expect(page.getByText('Table 2: 3 seats')).toBeVisible();
  } finally {
    deleteSlot(slotId);
  }
});
