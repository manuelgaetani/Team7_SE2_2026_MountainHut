import { randomInt, randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { createPredefinedHike, deletePredefinedHike, insertHike } from '../../fixtures/db.js';

// MH-20: a hiker registers a planned hike before departure from /hikes/new, finds it in
// My hikes, and the staff see it with the hiker's contacts on /staff/hikes.

interface RegisteredHike {
  id: number;
  destination: string;
  route: string;
  passagePoints: string[];
  predefinedHikeId: number | null;
}

// The page reads the dates and "now" in the time of the browser: the hut's.
test.use({ timezoneId: 'Europe/Rome' });

// The hut-local date (YYYY-MM-DD) `days` days from now.
const hutDate = (days: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(
    new Date(Date.now() + days * 86_400_000),
  );

// A day soon, so the calendar is only a few clicks away; each test has its own hiker.
const soonDay = (): string => hutDate(2 + randomInt(20));

async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}

// Chooses a day in the calendar of a DateField: month by month, then the day.
async function pickDate(page: Page, label: string, iso: string): Promise<void> {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const title = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  await page.getByLabel(label, { exact: true }).click();
  const calendar = page.getByRole('group', { name: 'Calendar' });
  for (let i = 0; i < 24 && !(await calendar.getByText(title).isVisible()); i++) {
    await calendar.getByRole('button', { name: 'Next month' }).click();
  }
  await expect(calendar.getByText(title)).toBeVisible();
  await calendar.getByRole('button', { name: new RegExp(`^\\S+ ${day} `) }).click();
  await expect(calendar).toHaveCount(0);
}

// Fills the "When" section: one day out, from `from` to `to`.
async function fillWhen(page: Page, day: string, from: string, to: string): Promise<void> {
  await pickDate(page, 'Departure date *', day);
  await page.getByLabel('Departure time *').fill(from);
  // The return date follows the departure date.
  await page.getByLabel('Expected return time *').fill(to);
}

async function myHikes(client: APIRequestContext): Promise<RegisteredHike[]> {
  const res = await client.get('/api/hikes/mine');
  expect(res.status()).toBe(200);
  return (await res.json()) as RegisteredHike[];
}

test.describe('MH-20 UI: Register a hike', () => {
  test('a visitor is asked to sign in', async ({ page }) => {
    await page.goto('/hikes/new');
    const notice = page.locator('.notice', { hasText: 'to register a hike.' });
    await expect(notice).toBeVisible();
    // The link of the notice comes back to the form after signing in.
    await expect(notice.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
      'href',
      '/login?next=%2Fhikes%2Fnew',
    );
    await expect(page.getByLabel('Destination *')).toHaveCount(0);
  });

  test('a staff account cannot register a hike', async ({ page, employeeUser }) => {
    await signIn(page, employeeUser);
    await page.goto('/hikes/new');
    await expect(page.getByText('Staff accounts cannot register a hike.')).toBeVisible();
    await expect(page.getByLabel('Destination *')).toHaveCount(0);
  });

  test('a hiker registers a hike from scratch and finds it in My hikes', async ({
    page,
    registeredUser,
    loggedInRequest,
  }) => {
    const destination = `Monte Vettore ${randomUUID().slice(0, 8)}`;
    const day = soonDay();
    await signIn(page, registeredUser);
    await page.getByRole('link', { name: 'Register a hike' }).first().click();
    await expect(page).toHaveURL(/\/hikes\/new$/);

    await page.getByLabel('Destination *').fill(destination);
    await page.getByLabel('Route *').fill('From Forca di Presta via Rifugio Zilioli');
    await page.getByRole('button', { name: 'Add a passage point' }).click();
    await page.getByLabel('Passage point 1', { exact: true }).fill('Forca di Presta');
    await page.getByRole('button', { name: 'Add another passage point' }).click();
    await page.getByLabel('Passage point 2', { exact: true }).fill('Rifugio Tito Zilioli');
    await fillWhen(page, day, '08:00', '17:00');

    // The recap follows the form.
    const recap = page.locator('.hike-summary');
    await expect(recap).toContainText(destination);
    await expect(recap).toContainText('Forca di Presta → Rifugio Tito Zilioli');
    await expect(recap).toContainText('9 h');

    await page.getByRole('button', { name: 'Register the hike' }).click();
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    const shown = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, d)));
    await expect(
      page.getByText(`Hike registered: ${destination}, ${shown.replace(',', '')} ${y} at 08:00.`),
    ).toBeVisible();
    // The form is empty again.
    await expect(page.getByLabel('Destination *')).toHaveValue('');

    const [saved] = await myHikes(loggedInRequest);
    expect(saved).toMatchObject({
      destination,
      route: 'From Forca di Presta via Rifugio Zilioli',
      passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
      predefinedHikeId: null,
    });

    await page.getByRole('button', { name: 'View my hikes' }).click();
    await expect(page).toHaveURL(/\/hikes$/);
    const card = page.getByRole('article', { name: destination });
    await expect(card).toContainText('Planned');
    await expect(card).toContainText('Via Forca di Presta → Rifugio Tito Zilioli');
    await expect(card).toContainText('08:00');
    await expect(card).toContainText('17:00');
  });

  test('a hiker starts from a popular hike and changes it', async ({
    page,
    registeredUser,
    loggedInRequest,
  }) => {
    const destination = `Monte Bove ${randomUUID().slice(0, 8)}`;
    const predefinedId = createPredefinedHike(destination, 'From Frontignano', [
      'Rifugio del Fargno',
      'Forcella Angagnola',
    ]);
    try {
      await signIn(page, registeredUser);
      await page.goto('/hikes/new');

      const tile = page.getByRole('button', { name: new RegExp(destination) });
      await tile.click();
      await expect(tile).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByLabel('Destination *')).toHaveValue(destination);
      await expect(page.getByLabel('Route *')).toHaveValue('From Frontignano');
      await expect(page.getByLabel('Passage point 2', { exact: true })).toHaveValue(
        'Forcella Angagnola',
      );

      // Start from scratch empties what the tile filled.
      await page.getByRole('button', { name: 'Start from scratch' }).click();
      await expect(page.getByLabel('Destination *')).toHaveValue('');
      await expect(page.getByLabel('Passage point 1', { exact: true })).toHaveCount(0);

      await tile.click();
      await page.getByLabel('Route *').fill('From Frontignano, back via Pizzo Tre Vescovi');
      // Removing asks first, in a popup.
      await page.getByRole('button', { name: 'Remove passage point 2' }).click();
      const question = page.getByRole('alertdialog', { name: 'Remove this passage point?' });
      await expect(question).toContainText('Forcella Angagnola will be removed from the hike.');
      await question.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(question).toHaveCount(0);
      await expect(page.getByLabel('Passage point 2', { exact: true })).toHaveCount(0);
      await fillWhen(page, soonDay(), '07:30', '15:00');
      await page.getByRole('button', { name: 'Register the hike' }).click();
      await expect(page.getByText(`Hike registered: ${destination},`)).toBeVisible();

      const [saved] = await myHikes(loggedInRequest);
      expect(saved).toMatchObject({
        destination,
        route: 'From Frontignano, back via Pizzo Tre Vescovi',
        passagePoints: ['Rifugio del Fargno'],
        predefinedHikeId: predefinedId,
      });
    } finally {
      deletePredefinedHike(predefinedId);
    }
  });

  test('shows what is missing or wrong and registers nothing', async ({
    page,
    registeredUser,
    loggedInRequest,
  }) => {
    await signIn(page, registeredUser);
    await page.goto('/hikes/new');

    const fixFields = page.getByText('Some fields need a fix: see the messages in the form.');
    await expect(fixFields).toHaveCount(0);
    await page.getByRole('button', { name: 'Register the hike' }).click();
    // Under the button, and the first field to fix takes the focus.
    await expect(fixFields).toBeVisible();
    await expect(page.getByLabel('Destination *')).toBeFocused();
    await expect(page.getByText('Enter the destination of the hike.')).toBeVisible();
    await expect(page.getByText('Describe the route you will take.')).toBeVisible();
    await expect(page.getByText('Choose the departure date.')).toBeVisible();

    await page.getByLabel('Destination *').fill('Monte Vettore');
    await page.getByLabel('Route *').fill('From Forca di Presta');
    await page.getByRole('button', { name: 'Add a passage point' }).click();
    await fillWhen(page, soonDay(), '17:00', '08:00');
    await page.getByRole('button', { name: 'Register the hike' }).click();

    await expect(
      page.getByText('The expected return must be after the planned departure.'),
    ).toBeVisible();
    await expect(
      page.getByText('Enter the name of the place, or remove this passage point.'),
    ).toBeVisible();
    expect(await myHikes(loggedInRequest)).toEqual([]);
  });

  test('shows the overlap with a hike already registered', async ({
    page,
    registeredUser,
    loggedInRequest,
  }) => {
    const day = soonDay();
    const first = `Monte Sibilla ${randomUUID().slice(0, 8)}`;
    const res = await loggedInRequest.post('/api/hikes', {
      data: {
        destination: first,
        route: 'From Montemonaco',
        departureDate: day,
        departureTime: '08:00',
        returnDate: day,
        returnTime: '17:00',
      },
    });
    expect(res.status()).toBe(201);

    await signIn(page, registeredUser);
    await page.goto('/hikes/new');
    await page.getByLabel('Destination *').fill('Monte Vettore');
    await page.getByLabel('Route *').fill('From Forca di Presta');
    await fillWhen(page, day, '12:00', '19:00');
    await page.getByRole('button', { name: 'Register the hike' }).click();

    await expect(
      page.getByText(`This hike overlaps your hike to ${first} (${day} 08:00 – ${day} 17:00)`),
    ).toBeVisible();
    expect(await myHikes(loggedInRequest)).toHaveLength(1);
  });
});

test.describe('MH-20 UI: My hikes', () => {
  test('a past hike is under Past, and Upcoming offers to register one', async ({
    page,
    registeredUser,
  }) => {
    const destination = `Monte Priora ${randomUUID().slice(0, 8)}`;
    insertHike(registeredUser.email, {
      destination,
      route: 'From Foce',
      departureAt: '2025-08-10 07:00',
      returnAt: '2025-08-10 16:00',
    });

    await signIn(page, registeredUser);
    await page.goto('/hikes');
    await expect(page.getByText('You have no upcoming hikes.')).toBeVisible();
    await expect(
      page.getByRole('tabpanel').getByRole('link', { name: 'Register a hike' }),
    ).toHaveAttribute('href', '/hikes/new');

    await page.getByRole('tab', { name: 'Past' }).click();
    const card = page.getByRole('article', { name: destination });
    await expect(card).toContainText('Past');
    await expect(card).toContainText('Sunday 10 August 2025, 07:00');
  });

  test('a staff account has no hikes', async ({ page, employeeUser }) => {
    await signIn(page, employeeUser);
    await page.goto('/hikes');
    await expect(page.getByText('Staff accounts have no hikes.')).toBeVisible();
  });
});

test.describe('MH-20 UI: Hikes for the staff', () => {
  test('the staff find a planned hike with the contacts of the hiker', async ({
    page,
    employeeUser,
    registeredUser,
    loggedInRequest,
  }) => {
    const destination = `Monte Argentella ${randomUUID().slice(0, 8)}`;
    const day = hutDate(5);
    const res = await loggedInRequest.post('/api/hikes', {
      data: {
        destination,
        route: 'From Forca di Presta',
        passagePoints: ['Sella delle Ciaule'],
        departureDate: day,
        departureTime: '08:00',
        returnDate: day,
        returnTime: '17:00',
      },
    });
    expect(res.status()).toBe(201);

    await signIn(page, employeeUser);
    await page.goto('/staff/hikes');
    await page.getByRole('tab', { name: /^Planned/ }).click();
    await page.getByLabel('Search').fill(destination);

    const card = page.getByRole('article', { name: destination });
    await expect(card).toContainText('Planned');
    await expect(card).toContainText('Via Sella delle Ciaule');
    const hiker = card.getByRole('group', { name: 'Hiker' });
    await expect(hiker).toContainText(registeredUser.fullName);
    await expect(hiker.getByRole('link', { name: registeredUser.phone })).toHaveAttribute(
      'href',
      `tel:${registeredUser.phone}`,
    );
    await expect(hiker.getByRole('link', { name: registeredUser.email })).toHaveAttribute(
      'href',
      `mailto:${registeredUser.email}`,
    );
    await expect(hiker).toContainText('—');

    await page.getByLabel('Search').fill(`no such hike ${randomUUID()}`);
    await expect(page.getByText('No hike matches the search.')).toBeVisible();
  });

  test('a hiker cannot open the staff page', async ({ page, registeredUser }) => {
    await signIn(page, registeredUser);
    await page.goto('/staff/hikes');
    await expect(page.getByText('This page is for the hut staff.')).toBeVisible();
  });
});
