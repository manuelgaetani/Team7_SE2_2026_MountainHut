import { execFileSync } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { emailCount, waitForEmails } from '../../fixtures/mailpit.js';

// MH-07, the parts already implemented: hiker search for the staff, forced password change and
// password recovery by email.
// TODO(MH-07): add the staff reservation for an existing, temporary or new hiker when its
// endpoint exists (only the contract `createStaffBookingSchema` is there now).

interface HikerProfile {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  temporary: boolean;
}

const RESET_REQUESTED = 'If the email is registered, a reset link has been sent';
const RESET_SUBJECT = 'Reset your Mountain Hut password';

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

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

// Tests share the database: each test searches for a word that only its own hikers contain.
const uniqueWord = () => `Zq${randomUUID().slice(0, 8)}`;

// A user with a profile, registered through the API.
async function register(
  request: APIRequestContext,
  data: Partial<TestUser> = {},
): Promise<TestUser> {
  const user: TestUser = {
    email: `e2e-${randomUUID()}@example.test`,
    password: `Pw${randomUUID()}`,
    fullName: 'E2E Hiker',
    phone: '+39 333 1234567',
    ...data,
  };
  expect((await request.post('/api/auth/register', { data: user })).status()).toBe(201);
  return user;
}

// A hiker without an account, as the quick entry of the staff will create it.
function insertTemporaryHiker(fullName: string, phone: string | null = null): number {
  return Number(
    sql(
      `INSERT INTO hikers (full_name, phone, updated_at)
       VALUES (${quote(fullName)}, ${phone === null ? 'NULL' : quote(phone)}, now()) RETURNING id;`,
    ),
  );
}

async function loggedIn(
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string | undefined,
  user: { email: string; password: string },
): Promise<APIRequestContext> {
  const context = await playwright.request.newContext({ baseURL });
  const login = await context.post('/api/auth/login', {
    data: { email: user.email, password: user.password },
  });
  expect(login.status()).toBe(200);
  return context;
}

const login = (request: APIRequestContext, email: string, password: string) =>
  request.post('/api/auth/login', { data: { email, password } });

const search = (request: APIRequestContext, text: string) =>
  request.get(`/api/hikers?search=${encodeURIComponent(text)}`);

async function found(request: APIRequestContext, text: string): Promise<HikerProfile[]> {
  const response = await search(request, text);
  expect(response.status()).toBe(200);
  return (await response.json()) as HikerProfile[];
}

// Asks for a reset link and returns the code in it, read from the last email in Mailpit.
async function resetToken(request: APIRequestContext, email: string): Promise<string> {
  const before = await emailCount(request, email);
  const response = await request.post('/api/auth/password-reset/request', { data: { email } });
  expect(response.status()).toBe(200);
  const emails = await waitForEmails(request, email, before + 1);
  const latest = emails.find((m) => m.Subject === RESET_SUBJECT)!;
  const token = latest.Text.match(/reset-password\?token=([^\s]+)/)?.[1];
  expect(token).toBeDefined();
  return decodeURIComponent(token!);
}

const confirmReset = (request: APIRequestContext, token: string, password: string) =>
  request.post('/api/auth/password-reset/confirm', { data: { token, password } });

test.describe('MH-07 API: hiker search for the staff', () => {
  test('finds a hiker by part of the name, ignoring case', async ({ request, employeeRequest }) => {
    const word = uniqueWord();
    const user = await register(request, { fullName: `Anna ${word} Rossi` });

    const results = await found(employeeRequest, word.toLowerCase());
    expect(results).toEqual([
      expect.objectContaining({
        fullName: `Anna ${word} Rossi`,
        email: user.email,
        phone: user.phone,
        temporary: false,
      }),
    ]);
  });

  test('finds a hiker by phone and by email', async ({ request, employeeRequest }) => {
    const digits = String(randomInt(1_000_000, 9_999_999));
    const user = await register(request, { phone: `+39 340 ${digits}` });

    expect((await found(employeeRequest, digits)).map((h) => h.email)).toEqual([user.email]);
    expect((await found(employeeRequest, user.email.toUpperCase())).map((h) => h.email)).toEqual([
      user.email,
    ]);
  });

  test('marks a hiker without an account as temporary', async ({ employeeRequest }) => {
    const word = uniqueWord();
    const id = insertTemporaryHiker(`Walk ${word} In`);

    expect(await found(employeeRequest, word)).toEqual([
      expect.objectContaining({ id, email: null, phone: null, temporary: true }),
    ]);
  });

  test('returns at most 20 hikers, ordered by name', async ({ employeeRequest }) => {
    const word = uniqueWord();
    for (let i = 21; i >= 1; i--) insertTemporaryHiker(`${word} ${String(i).padStart(2, '0')}`);

    const results = await found(employeeRequest, word);
    expect(results).toHaveLength(20);
    expect(results.map((h) => h.fullName)).toEqual(
      Array.from({ length: 20 }, (_, i) => `${word} ${String(i + 1).padStart(2, '0')}`),
    );
  });

  test('returns an empty list when nobody matches', async ({ employeeRequest }) => {
    expect(await found(employeeRequest, uniqueWord())).toEqual([]);
  });

  test('a warden can search too', async ({ wardenRequest }) => {
    expect((await search(wardenRequest, uniqueWord())).status()).toBe(200);
  });

  test('rejects a search shorter than 2 characters: 400', async ({ employeeRequest }) => {
    expect((await search(employeeRequest, 'a')).status()).toBe(400);
    expect((await search(employeeRequest, '  a  ')).status()).toBe(400);
    expect((await employeeRequest.get('/api/hikers')).status()).toBe(400);
  });

  test('is for the staff only', async ({ request, loggedInRequest }) => {
    expect((await search(request, 'rossi')).status()).toBe(401);
    expect((await search(loggedInRequest, 'rossi')).status()).toBe(403);
  });
});

test.describe('MH-07 API: change password', () => {
  test('changes the password: the old one stops working', async ({
    request,
    playwright,
    baseURL,
  }) => {
    const user = await register(request);
    const session = await loggedIn(playwright, baseURL, user);
    const newPassword = `New${randomUUID()}`;

    const response = await session.post('/api/auth/change-password', {
      data: { currentPassword: user.password, newPassword },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ email: user.email, mustChangePassword: false });

    expect((await session.get('/api/auth/me')).status()).toBe(200);
    expect((await login(request, user.email, user.password)).status()).toBe(401);
    expect((await login(request, user.email, newPassword)).status()).toBe(200);
    await session.dispose();
  });

  test('logs out the other sessions of the user', async ({ request, playwright, baseURL }) => {
    const user = await register(request);
    const current = await loggedIn(playwright, baseURL, user);
    const other = await loggedIn(playwright, baseURL, user);

    const response = await current.post('/api/auth/change-password', {
      data: { currentPassword: user.password, newPassword: `New${randomUUID()}` },
    });
    expect(response.status()).toBe(200);

    // The current session first: a revoked refresh token presented again is taken as stolen and
    // closes every session of the user, the current one too.
    expect((await current.post('/api/auth/refresh')).status()).toBe(200);
    expect((await other.post('/api/auth/refresh')).status()).toBe(401);
    await current.dispose();
    await other.dispose();
  });

  test('ends the forced change of an account created by the staff', async ({
    request,
    playwright,
    baseURL,
  }) => {
    const user = await register(request);
    sql(`UPDATE users SET must_change_password = true WHERE email = ${quote(user.email)};`);

    const first = await login(request, user.email, user.password);
    expect(await first.json()).toMatchObject({ mustChangePassword: true });
    const session = await loggedIn(playwright, baseURL, user);
    expect(await (await session.get('/api/auth/me')).json()).toMatchObject({
      mustChangePassword: true,
    });

    const response = await session.post('/api/auth/change-password', {
      data: { currentPassword: user.password, newPassword: `New${randomUUID()}` },
    });
    expect(response.status()).toBe(200);
    expect(await (await session.get('/api/auth/me')).json()).toMatchObject({
      mustChangePassword: false,
    });
    await session.dispose();
  });

  test('refuses a wrong current password: 403', async ({ request, playwright, baseURL }) => {
    const user = await register(request);
    const session = await loggedIn(playwright, baseURL, user);

    const response = await session.post('/api/auth/change-password', {
      data: { currentPassword: `Wrong${randomUUID()}`, newPassword: `New${randomUUID()}` },
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ message: 'Current password is wrong' });
    expect((await login(request, user.email, user.password)).status()).toBe(200);
    await session.dispose();
  });

  test('refuses the same password: 422', async ({ request, playwright, baseURL }) => {
    const user = await register(request);
    const session = await loggedIn(playwright, baseURL, user);

    const response = await session.post('/api/auth/change-password', {
      data: { currentPassword: user.password, newPassword: user.password },
    });
    expect(response.status()).toBe(422);
    await session.dispose();
  });

  test('refuses a weak new password: 400', async ({ request, playwright, baseURL }) => {
    const user = await register(request);
    const session = await loggedIn(playwright, baseURL, user);

    const response = await session.post('/api/auth/change-password', {
      data: { currentPassword: user.password, newPassword: 'onlyletters' },
    });
    expect(response.status()).toBe(400);
    await session.dispose();
  });

  test('needs a session: 401', async ({ request }) => {
    const response = await request.post('/api/auth/change-password', {
      data: { currentPassword: 'Old12345', newPassword: 'New12345' },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe('MH-07 API: password recovery by email', () => {
  test('sends a link that sets a new password', async ({ request }) => {
    const user = await register(request);
    const token = await resetToken(request, user.email);
    const newPassword = `New${randomUUID()}`;

    const response = await confirmReset(request, token, newPassword);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ message: 'Password changed' });

    expect((await login(request, user.email, user.password)).status()).toBe(401);
    expect((await login(request, user.email, newPassword)).status()).toBe(200);
  });

  test('gives the same answer for an unknown email, and sends nothing', async ({ request }) => {
    const unknown = `e2e-nobody-${randomUUID()}@example.test`;

    const response = await request.post('/api/auth/password-reset/request', {
      data: { email: unknown },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ message: RESET_REQUESTED });
    // The email of a registered user arrives within a second.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await emailCount(request, unknown)).toBe(0);
  });

  test('the link works only once: 422 the second time', async ({ request }) => {
    const user = await register(request);
    const token = await resetToken(request, user.email);

    expect((await confirmReset(request, token, `New${randomUUID()}`)).status()).toBe(200);
    const again = await confirmReset(request, token, `Other${randomUUID()}`);
    expect(again.status()).toBe(422);
    expect(await again.json()).toMatchObject({ message: 'The link is invalid or has expired' });
  });

  test('a new request replaces the previous link', async ({ request }) => {
    const user = await register(request);
    const first = await resetToken(request, user.email);
    const second = await resetToken(request, user.email);

    expect((await confirmReset(request, first, `New${randomUUID()}`)).status()).toBe(422);
    expect((await confirmReset(request, second, `New${randomUUID()}`)).status()).toBe(200);
  });

  test('an expired link: 422, and the password does not change', async ({ request }) => {
    const user = await register(request);
    const token = await resetToken(request, user.email);
    sql(
      `UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'
       WHERE user_id = (SELECT id FROM users WHERE email = ${quote(user.email)});`,
    );

    expect((await confirmReset(request, token, `New${randomUUID()}`)).status()).toBe(422);
    expect((await login(request, user.email, user.password)).status()).toBe(200);
  });

  test('an unknown code: 422', async ({ request }) => {
    expect((await confirmReset(request, randomUUID(), `New${randomUUID()}`)).status()).toBe(422);
  });

  test('logs out every session and ends a forced change', async ({
    request,
    playwright,
    baseURL,
  }) => {
    const user = await register(request);
    sql(`UPDATE users SET must_change_password = true WHERE email = ${quote(user.email)};`);
    const session = await loggedIn(playwright, baseURL, user);
    const token = await resetToken(request, user.email);
    const newPassword = `New${randomUUID()}`;

    expect((await confirmReset(request, token, newPassword)).status()).toBe(200);

    expect((await session.post('/api/auth/refresh')).status()).toBe(401);
    const relogin = await login(request, user.email, newPassword);
    expect(await relogin.json()).toMatchObject({ mustChangePassword: false });
    await session.dispose();
  });

  test('rejects an invalid email or a weak password: 400', async ({ request }) => {
    const badEmail = await request.post('/api/auth/password-reset/request', {
      data: { email: 'not-an-email' },
    });
    expect(badEmail.status()).toBe(400);
    expect((await confirmReset(request, randomUUID(), 'onlyletters')).status()).toBe(400);
  });
});
