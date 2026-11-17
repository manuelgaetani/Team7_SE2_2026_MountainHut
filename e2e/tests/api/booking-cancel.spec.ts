import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import { bookingStatus, createSlot, deleteSlot, removeHikerProfile } from '../../fixtures/db.js';

interface SlotSummary {
  id: number;
  freeSeats: number;
  availability: string;
}

interface BookingResponse {
  id: number;
  slotId: number;
  partySize: number;
  status: string;
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
               LEAST(${start}::time(0) + interval '1 hour', TIME '23:59:59')) RETURNING id;`,
    ),
  );
  sql(`INSERT INTO slot_tables (slot_id, table_number, seats) VALUES (${id}, 1, ${seats});`);
  slotIds.push(id);
  return id;
}

// A booking written directly in the database, for a slot too close to be booked through the API.
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

async function book(
  request: APIRequestContext,
  slotId: number,
  partySize: number,
): Promise<BookingResponse> {
  const response = await request.post('/api/bookings', { data: { slotId, partySize } });
  expect(response.status()).toBe(201);
  return (await response.json()) as BookingResponse;
}

const cancel = (request: APIRequestContext, bookingId: number | string) =>
  request.post(`/api/bookings/${bookingId}/cancel`);

async function listedSlot(request: APIRequestContext, id: number): Promise<SlotSummary> {
  const response = await request.get('/api/slots');
  expect(response.status()).toBe(200);
  const found = ((await response.json()) as SlotSummary[]).find((s) => s.id === id);
  expect(found).toBeDefined();
  return found!;
}

// Another hiker, registered and logged in. Pass `withoutProfile` for an account without a hiker
// profile, like a staff account.
async function otherHiker(
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string | undefined,
  withoutProfile = false,
): Promise<APIRequestContext> {
  const user = {
    email: `e2e-other-${randomUUID()}@example.test`,
    password: randomUUID(),
    fullName: 'Other Hiker',
    phone: '+39 333 7654321',
  };
  const context = await playwright.request.newContext({ baseURL });
  expect((await context.post('/api/auth/register', { data: user })).status()).toBe(201);
  if (withoutProfile) removeHikerProfile(user.email);
  const login = await context.post('/api/auth/login', {
    data: { email: user.email, password: user.password },
  });
  expect(login.status()).toBe(200);
  return context;
}

test.describe('MH-08 API: cancel a booking', () => {
  test('cancels a booking and frees its seats', async ({ loggedInRequest }) => {
    const slotId = slot([4]);
    const booking = await book(loggedInRequest, slotId, 3);
    expect(await listedSlot(loggedInRequest, slotId)).toMatchObject({ freeSeats: 1 });

    const response = await cancel(loggedInRequest, booking.id);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      id: booking.id,
      slotId,
      partySize: 3,
      status: 'CANCELLED',
    });

    expect(bookingStatus(booking.id)).toBe('CANCELLED');
    expect(await listedSlot(loggedInRequest, slotId)).toMatchObject({
      freeSeats: 4,
      availability: 'AVAILABLE',
    });
  });

  test('gives the freed seats to another hiker', async ({
    loggedInRequest,
    playwright,
    baseURL,
  }) => {
    const slotId = slot([2]);
    const booking = await book(loggedInRequest, slotId, 2);
    const other = await otherHiker(playwright, baseURL);

    const refused = await other.post('/api/bookings', { data: { slotId, partySize: 2 } });
    expect(refused.status()).toBe(409);

    expect((await cancel(loggedInRequest, booking.id)).status()).toBe(200);
    const accepted = await other.post('/api/bookings', { data: { slotId, partySize: 2 } });
    expect(accepted.status()).toBe(201);
    await other.dispose();
  });

  test('lets the hiker book the same slot again after cancelling', async ({ loggedInRequest }) => {
    const slotId = slot([4]);
    const first = await book(loggedInRequest, slotId, 2);
    expect((await cancel(loggedInRequest, first.id)).status()).toBe(200);

    const second = await book(loggedInRequest, slotId, 2);
    expect(second.id).not.toBe(first.id);
  });

  test.describe('no time constraints', () => {
    test('cancels a booking for a slot that starts in about 3 hours', async ({
      loggedInRequest,
    }) => {
      const slotId = slotStartingIn(3, 4);
      const booking = await book(loggedInRequest, slotId, 2);

      expect((await cancel(loggedInRequest, booking.id)).status()).toBe(200);
      expect(bookingStatus(booking.id)).toBe('CANCELLED');
    });

    test('cancels a booking for a slot that starts in about 1 hour', async ({
      loggedInRequest,
      registeredUser,
    }) => {
      // Too close to be booked online (MH-01), but a booking made earlier can still be cancelled.
      const slotId = slotStartingIn(1, 4);
      const bookingId = insertBooking(registeredUser.email, slotId, 2);

      expect((await cancel(loggedInRequest, bookingId)).status()).toBe(200);
      expect(bookingStatus(bookingId)).toBe('CANCELLED');
    });
  });

  test.describe('refused cancellations', () => {
    test('a booking that is already cancelled: 409', async ({ loggedInRequest }) => {
      const booking = await book(loggedInRequest, slot([4]), 2);
      expect((await cancel(loggedInRequest, booking.id)).status()).toBe(200);

      const again = await cancel(loggedInRequest, booking.id);
      expect(again.status()).toBe(409);
      expect(await again.json()).toMatchObject({ message: 'This booking is already cancelled' });
    });

    test('a rejected booking: 409', async ({ loggedInRequest }) => {
      const booking = await book(loggedInRequest, slot([4]), 2);
      sql(`UPDATE bookings SET status = 'REJECTED' WHERE id = ${booking.id};`);

      const response = await cancel(loggedInRequest, booking.id);
      expect(response.status()).toBe(409);
      expect(await response.json()).toMatchObject({
        message: 'A rejected booking cannot be cancelled',
      });
      expect(bookingStatus(booking.id)).toBe('REJECTED');
    });

    test('the booking of another hiker looks missing: 404, and it stays active', async ({
      loggedInRequest,
      playwright,
      baseURL,
    }) => {
      const booking = await book(loggedInRequest, slot([4]), 2);
      const other = await otherHiker(playwright, baseURL);

      const response = await cancel(other, booking.id);
      expect(response.status()).toBe(404);
      expect(await response.json()).toMatchObject({ message: 'Booking not found' });
      expect(bookingStatus(booking.id)).not.toBe('CANCELLED');
      await other.dispose();
    });

    test('a booking that does not exist: 404', async ({ loggedInRequest }) => {
      expect((await cancel(loggedInRequest, 2_147_483_647)).status()).toBe(404);
      expect((await cancel(loggedInRequest, 2_147_483_648)).status()).toBe(404);
    });

    test('an id that is not a number: 400', async ({ loggedInRequest }) => {
      expect((await cancel(loggedInRequest, 'abc')).status()).toBe(400);
    });

    test('without a session: 401', async ({ request }) => {
      expect((await cancel(request, 1)).status()).toBe(401);
    });

    test('an employee: 403, and the booking stays active', async ({
      loggedInRequest,
      employeeRequest,
    }) => {
      const booking = await book(loggedInRequest, slot([4]), 2);

      expect((await cancel(employeeRequest, booking.id)).status()).toBe(403);
      expect(bookingStatus(booking.id)).not.toBe('CANCELLED');
    });

    test('an account without a hiker profile: 403', async ({
      loggedInRequest,
      playwright,
      baseURL,
    }) => {
      const booking = await book(loggedInRequest, slot([4]), 2);
      const noProfile = await otherHiker(playwright, baseURL, true);

      const response = await cancel(noProfile, booking.id);
      expect(response.status()).toBe(403);
      expect(bookingStatus(booking.id)).not.toBe('CANCELLED');
      await noProfile.dispose();
    });
  });
});
