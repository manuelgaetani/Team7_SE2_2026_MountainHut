import { execFileSync } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import {
  bookingStatus,
  createPastSlot,
  createSlot,
  deleteSlot,
  partyRequirements,
} from '../../fixtures/db.js';
import { emailCount, waitForEmails } from '../../fixtures/mailpit.js';

// MH-07: the staff enter a reservation for an existing, temporary or new hiker, search hikers,
// and the hikers change or recover their password.

interface HikerProfile {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes?: string | null;
  emergencyContact?: string | null;
  temporary: boolean;
}

interface StaffBookingResult {
  id: number;
  slotId: number;
  partySize: number;
  status: string;
  tables: { tableNumber: number; assignedSeats: number }[];
  requirements: { allergies: boolean; description: string }[];
  hiker: HikerProfile;
  generatedPassword?: string;
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

const staffBook = (request: APIRequestContext, data: Record<string, unknown>) =>
  request.post('/api/staff/bookings', { data });

async function staffBooked(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<StaffBookingResult> {
  const response = await staffBook(request, data);
  expect(response.status()).toBe(201);
  return (await response.json()) as StaffBookingResult;
}

const bookingsInSlot = (slotId: number) =>
  Number(sql(`SELECT count(*) FROM bookings WHERE slot_id = ${slotId};`));

const userCount = (email: string) =>
  Number(sql(`SELECT count(*) FROM users WHERE email = ${quote(email)};`));

// A slot of today with one table, starting `minutes` from now (negative: already started).
// Slots are unique by date, start and end, and tests run in parallel: the end is random to the
// second. The slots of today of other tests overlap this one, and overlapping slots share the
// seats of the same table number: a random table number keeps the seats of this slot to itself.
function todaySlot(minutes: number, seats: number): number {
  const start = `date_trunc('minute', now() AT TIME ZONE 'Europe/Rome' + ${minutes} * interval '1 minute')`;
  const slotId = sql(
    `INSERT INTO slots (date, start_time, end_time)
     VALUES (${start}::date, ${start}::time(0), TIME '23:59' + ${randomInt(60)} * interval '1 second')
     RETURNING id;`,
  );
  sql(
    `INSERT INTO slot_tables (slot_id, table_number, seats)
     VALUES (${slotId}, ${randomInt(1_000, 1_000_000)}, ${seats});`,
  );
  return Number(slotId);
}

// The new regular hiker of the staff: the same details as the web registration, no password.
const newAccount = (data: Record<string, unknown> = {}) => ({
  kind: 'ACCOUNT',
  email: `e2e-staff-${randomUUID()}@example.test`,
  fullName: `Desk ${uniqueWord()} Hiker`,
  phone: '+39 347 7654321',
  ...data,
});

// Three groups of 4 letters and digits, without 0/o and 1/l/i: "k7mq-x3tz-9pwa".
const GENERATED_PASSWORD = /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/;

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

test.describe('MH-07 API: reservation entered by the staff', () => {
  test('for a hiker already in the system: confirmed at once, with the email', async ({
    request,
    employeeRequest,
  }) => {
    const word = uniqueWord();
    const user = await register(request, { fullName: `Phone ${word} Caller` });
    const [hiker] = await found(employeeRequest, word);
    const slotId = createSlot([4, 2]);
    const before = await emailCount(request, user.email);

    const booking = await staffBooked(employeeRequest, {
      slotId,
      partySize: 3,
      hiker: { kind: 'EXISTING', hikerId: hiker!.id },
    });

    expect(booking).toMatchObject({
      slotId,
      partySize: 3,
      status: 'CONFIRMED',
      requirements: [],
      hiker: { id: hiker!.id, email: user.email, temporary: false },
    });
    expect(booking.tables.reduce((sum, t) => sum + t.assignedSeats, 0)).toBe(3);
    expect(booking).not.toHaveProperty('generatedPassword');
    expect(bookingStatus(booking.id)).toBe('CONFIRMED');
    const emails = await waitForEmails(request, user.email, before + 1);
    expect(emails.map((m) => m.Subject)).toContainEqual(
      expect.stringContaining(`Booking n. ${booking.id} confirmed`),
    );
  });

  test('for a temporary hiker already in the system', async ({ employeeRequest }) => {
    const hikerId = insertTemporaryHiker(`Walk ${uniqueWord()} In`, '+39 320 1112233');

    const booking = await staffBooked(employeeRequest, {
      slotId: createSlot([6]),
      partySize: 2,
      hiker: { kind: 'EXISTING', hikerId },
    });
    expect(booking).toMatchObject({
      status: 'CONFIRMED',
      hiker: { id: hikerId, email: null, temporary: true },
    });
  });

  test('quick entry: a temporary hiker with name and phone, who cannot log in', async ({
    employeeRequest,
  }) => {
    const word = uniqueWord();
    const booking = await staffBooked(employeeRequest, {
      slotId: createSlot([4]),
      partySize: 4,
      hiker: { kind: 'TEMPORARY', fullName: `Quick ${word} Entry`, phone: '+39 333 9876543' },
    });

    expect(booking.hiker).toMatchObject({
      fullName: `Quick ${word} Entry`,
      phone: '+39 333 9876543',
      email: null,
      temporary: true,
    });
    expect(booking).not.toHaveProperty('generatedPassword');
    // No account: the hiker is found by the staff, but has no email to log in with.
    expect(await found(employeeRequest, word)).toEqual([
      expect.objectContaining({ id: booking.hiker.id, temporary: true }),
    ]);
    expect(
      Number(
        sql(`SELECT count(*) FROM hikers WHERE id = ${booking.hiker.id} AND user_id IS NULL;`),
      ),
    ).toBe(1);
  });

  test('quick entry: the phone is optional', async ({ employeeRequest }) => {
    const booking = await staffBooked(employeeRequest, {
      slotId: createSlot([4]),
      partySize: 1,
      hiker: { kind: 'TEMPORARY', fullName: `Only ${uniqueWord()} Name` },
    });
    expect(booking.hiker).toMatchObject({ phone: null, email: null, temporary: true });
  });

  test('full details: a regular hiker with a generated password, changed at the first login', async ({
    request,
    playwright,
    baseURL,
    employeeRequest,
  }) => {
    const details = newAccount({
      notes: 'Arrives from the north trail',
      emergencyContact: 'Luca 3331234567',
    });
    const booking = await staffBooked(employeeRequest, {
      slotId: createSlot([4]),
      partySize: 2,
      hiker: details,
    });

    expect(booking.hiker).toMatchObject({
      email: details.email,
      fullName: details.fullName,
      phone: details.phone,
      notes: 'Arrives from the north trail',
      emergencyContact: 'Luca 3331234567',
      temporary: false,
    });
    const password = booking.generatedPassword!;
    expect(password).toMatch(GENERATED_PASSWORD);
    // The password is stored only as a hash.
    expect(sql(`SELECT password FROM users WHERE email = ${quote(details.email)};`)).not.toBe(
      password,
    );

    const first = await login(request, details.email, password);
    expect(first.status()).toBe(200);
    expect(await first.json()).toMatchObject({ mustChangePassword: true });

    const session = await loggedIn(playwright, baseURL, { email: details.email, password });
    const newPassword = `Mine${randomUUID()}`;
    const change = await session.post('/api/auth/change-password', {
      data: { currentPassword: password, newPassword },
    });
    expect(change.status()).toBe(200);
    expect(await change.json()).toMatchObject({ mustChangePassword: false });
    expect((await login(request, details.email, newPassword)).status()).toBe(200);
    await session.dispose();
  });

  test('full details: the new hiker gets the confirmation email and can recover the password', async ({
    request,
    employeeRequest,
  }) => {
    const details = newAccount();
    const booking = await staffBooked(employeeRequest, {
      slotId: createSlot([4]),
      partySize: 2,
      hiker: details,
    });

    const emails = await waitForEmails(request, details.email, 1);
    expect(emails[0]!.Subject).toContain(`Booking n. ${booking.id} confirmed`);

    const token = await resetToken(request, details.email);
    const newPassword = `Mine${randomUUID()}`;
    expect((await confirmReset(request, token, newPassword)).status()).toBe(200);
    const relogin = await login(request, details.email, newPassword);
    expect(relogin.status()).toBe(200);
    expect(await relogin.json()).toMatchObject({ mustChangePassword: false });
  });

  test('stores the party requirements of the reservation', async ({ employeeRequest }) => {
    const requirements = [
      { allergies: true, description: 'Two people allergic to nuts' },
      { allergies: false, description: 'One vegetarian' },
    ];
    const booking = await staffBooked(employeeRequest, {
      slotId: createSlot([6]),
      partySize: 5,
      requirements,
      hiker: { kind: 'TEMPORARY', fullName: `Group ${uniqueWord()} Leader` },
    });

    expect(booking.requirements).toEqual(requirements);
    expect(partyRequirements(booking.id)).toEqual(requirements);
  });

  test('can be entered less than 2 hours before the slot, unlike an online booking', async ({
    loggedInRequest,
    employeeRequest,
  }) => {
    // Starts in about one hour.
    const slotId = todaySlot(60 + randomInt(30), 8);
    try {
      const online = await loggedInRequest.post('/api/bookings', {
        data: { slotId, partySize: 2 },
      });
      expect(online.status()).toBe(422);

      const booking = await staffBooked(employeeRequest, {
        slotId,
        partySize: 2,
        hiker: { kind: 'TEMPORARY', fullName: `Early ${uniqueWord()} Arrival` },
      });
      expect(booking.status).toBe('CONFIRMED');
    } finally {
      // The other tests of today's slots would see these seats taken until the slot starts.
      deleteSlot(slotId);
    }
  });

  test('cannot be entered after the beginning of the slot: 422', async ({ employeeRequest }) => {
    for (const slotId of [todaySlot(-5 - randomInt(30), 4), createPastSlot([4])]) {
      const word = uniqueWord();
      const response = await staffBook(employeeRequest, {
        slotId,
        partySize: 2,
        hiker: { kind: 'TEMPORARY', fullName: `Late ${word} Arrival` },
      });
      expect(response.status()).toBe(422);
      expect(await response.json()).toMatchObject({ message: 'The slot has already started' });
      expect(bookingsInSlot(slotId)).toBe(0);
      // Refused booking: the new hiker is not stored either.
      expect(await found(employeeRequest, word)).toEqual([]);
    }
  });

  test('refuses a party larger than the free seats: 409, nothing stored', async ({
    employeeRequest,
  }) => {
    const slotId = createSlot([4]);
    const details = newAccount();

    const response = await staffBook(employeeRequest, { slotId, partySize: 5, hiker: details });
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({
      message: 'Insufficient seats available for this slot',
    });
    expect(bookingsInSlot(slotId)).toBe(0);
    expect(userCount(details.email)).toBe(0);
  });

  test('counts the seats already booked online', async ({ loggedInRequest, employeeRequest }) => {
    const slotId = createSlot([4]);
    expect(
      (await loggedInRequest.post('/api/bookings', { data: { slotId, partySize: 3 } })).status(),
    ).toBe(201);

    const tooMany = await staffBook(employeeRequest, {
      slotId,
      partySize: 2,
      hiker: { kind: 'TEMPORARY', fullName: `Extra ${uniqueWord()} Guest` },
    });
    expect(tooMany.status()).toBe(409);
    const lastSeat = await staffBook(employeeRequest, {
      slotId,
      partySize: 1,
      hiker: { kind: 'TEMPORARY', fullName: `Last ${uniqueWord()} Seat` },
    });
    expect(lastSeat.status()).toBe(201);
  });

  test('refuses a second booking of the same hiker in the slot: 409', async ({
    employeeRequest,
  }) => {
    const slotId = createSlot([8]);
    const hikerId = insertTemporaryHiker(`Twice ${uniqueWord()} Booked`);
    const data = { slotId, partySize: 2, hiker: { kind: 'EXISTING', hikerId } };

    await staffBooked(employeeRequest, data);
    const again = await staffBook(employeeRequest, data);
    expect(again.status()).toBe(409);
    expect(await again.json()).toMatchObject({
      message: 'The hiker already has a booking for this slot',
    });
    expect(bookingsInSlot(slotId)).toBe(1);
  });

  test('refuses an email that is already registered: 409, nothing stored', async ({
    request,
    employeeRequest,
  }) => {
    const user = await register(request);
    const slotId = createSlot([4]);

    const response = await staffBook(employeeRequest, {
      slotId,
      partySize: 2,
      hiker: newAccount({ email: user.email }),
    });
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({ message: 'Email already registered' });
    expect(bookingsInSlot(slotId)).toBe(0);
    // The existing account keeps its password.
    expect((await login(request, user.email, user.password)).status()).toBe(200);
  });

  test('an unknown slot or hiker: 404', async ({ employeeRequest }) => {
    const word = uniqueWord();
    const noSlot = await staffBook(employeeRequest, {
      slotId: 2_147_483_647,
      partySize: 2,
      hiker: { kind: 'TEMPORARY', fullName: `Lost ${word} Hiker` },
    });
    expect(noSlot.status()).toBe(404);
    expect(await noSlot.json()).toMatchObject({ message: 'Slot not found' });
    expect(await found(employeeRequest, word)).toEqual([]);

    const noHiker = await staffBook(employeeRequest, {
      slotId: createSlot([4]),
      partySize: 2,
      hiker: { kind: 'EXISTING', hikerId: 2_147_483_647 },
    });
    expect(noHiker.status()).toBe(404);
    expect(await noHiker.json()).toMatchObject({ message: 'Hiker not found' });
  });

  test('rejects invalid details: 400', async ({ employeeRequest }) => {
    const slotId = createSlot([4]);
    const invalid: Record<string, unknown>[] = [
      { slotId, partySize: 2 },
      { slotId, partySize: 0, hiker: { kind: 'TEMPORARY', fullName: 'Mario Rossi' } },
      { slotId, partySize: 2, hiker: { kind: 'SOMEONE', fullName: 'Mario Rossi' } },
      { slotId, partySize: 2, hiker: { kind: 'TEMPORARY', fullName: '' } },
      { slotId, partySize: 2, hiker: { kind: 'TEMPORARY', fullName: 'Mario Rossi', phone: '12' } },
      { slotId, partySize: 2, hiker: newAccount({ email: 'not-an-email' }) },
      {
        slotId,
        partySize: 2,
        hiker: { kind: 'ACCOUNT', fullName: 'Mario Rossi', phone: '+39 333 1234567' },
      },
      { slotId, partySize: 2, hiker: { kind: 'EXISTING', hikerId: 0 } },
    ];
    for (const data of invalid) {
      expect((await staffBook(employeeRequest, data)).status(), JSON.stringify(data)).toBe(400);
    }
    expect(bookingsInSlot(slotId)).toBe(0);
  });

  test('a warden can enter a reservation too', async ({ wardenRequest }) => {
    const booking = await staffBooked(wardenRequest, {
      slotId: createSlot([4]),
      partySize: 2,
      hiker: { kind: 'TEMPORARY', fullName: `Warden ${uniqueWord()} Guest` },
    });
    expect(booking.status).toBe('CONFIRMED');
  });

  test('is for the staff only', async ({ request, loggedInRequest }) => {
    const slotId = createSlot([4]);
    const data = { slotId, partySize: 2, hiker: { kind: 'TEMPORARY', fullName: 'Mario Rossi' } };

    expect((await staffBook(request, data)).status()).toBe(401);
    expect((await staffBook(loggedInRequest, data)).status()).toBe(403);
    expect(bookingsInSlot(slotId)).toBe(0);
  });
});
