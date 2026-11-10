import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { createImminentSlot, createSlot, deleteSlot } from '../../fixtures/db.js';

interface TableAllocation {
  tableNumber: number;
  assignedSeats: number;
}

interface BookingResponse {
  id: number;
  slotId: number;
  partySize: number;
  status: string;
  tables: TableAllocation[];
  requirements?: string | null;
}

interface SlotSummary {
  id: number;
  freeSeats: number;
  availability: string;
}

interface MailpitMessage {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
}

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';

let slotIds: number[] = [];

function slot(seats: number[]): number {
  const id = createSlot(seats);
  slotIds.push(id);
  return id;
}

function imminentSlot(seats: number[]): number {
  const id = createImminentSlot(seats);
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

async function listedSlot(request: APIRequestContext, id: number): Promise<SlotSummary> {
  const response = await request.get('/api/slots');
  expect(response.status()).toBe(200);
  const found = ((await response.json()) as SlotSummary[]).find((s) => s.id === id);
  expect(found).toBeDefined();
  return found!;
}

async function createBooking(
  request: APIRequestContext,
  slotId: number,
  partySize: number,
  requirements?: string,
): Promise<BookingResponse> {
  const response = await request.post('/api/bookings', {
    data: {
      slotId,
      partySize,
      ...(requirements !== undefined ? { requirements } : {}),
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as BookingResponse;
}

async function waitForUpdatedBookingEmail(
  request: APIRequestContext,
  to: string,
): Promise<MailpitMessage> {
  const query = encodeURIComponent(`to:"${to}"`);
  let id: string | undefined;

  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT_URL}/api/v1/search?query=${query}`);
        if (!res.ok()) return 0;
        const { messages } = (await res.json()) as { messages: { ID: string }[] };
        id = messages[0]?.ID;
        return messages.length;
      },
      { message: `Waiting for updated confirmation email sent to ${to}`, timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1);

  const res = await request.get(`${MAILPIT_URL}/api/v1/message/${id}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as MailpitMessage;
}

test.describe('MH-06 Black-Box API: Change a booking', () => {
  test('R3: Changes only the target slot (date/time) and updates table allocations in the new slot', async ({
    loggedInRequest,
  }) => {
    const sourceSlotId = slot([4]);
    const targetSlotId = slot([6]);

    const booking = await createBooking(loggedInRequest, sourceSlotId, 3);
    expect(booking.slotId).toBe(sourceSlotId);

    // Verify source slot has 1 seat remaining
    expect(await listedSlot(loggedInRequest, sourceSlotId)).toMatchObject({
      freeSeats: 1,
      availability: 'AVAILABLE',
    });

    // Change booking to target slot
    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { slotId: targetSlotId },
    });
    expect(patchRes.status()).toBe(200);

    const updated = (await patchRes.json()) as BookingResponse;
    expect(updated.id).toBe(booking.id);
    expect(updated.slotId).toBe(targetSlotId);
    expect(updated.partySize).toBe(3);
    expect(updated.tables).toEqual([{ tableNumber: 1, assignedSeats: 3 }]);

    // Source slot seats are freed (back to 4)
    expect(await listedSlot(loggedInRequest, sourceSlotId)).toMatchObject({
      freeSeats: 4,
      availability: 'AVAILABLE',
    });

    // Target slot seats are reduced (from 6 to 3)
    expect(await listedSlot(loggedInRequest, targetSlotId)).toMatchObject({
      freeSeats: 3,
      availability: 'AVAILABLE',
    });
  });

  test('R3 & R7: Changes only party size and automatically reallocates tables when available', async ({
    loggedInRequest,
  }) => {
    // Slot with tables of 2 and 4 seats
    const slotId = slot([2, 4]);

    const booking = await createBooking(loggedInRequest, slotId, 2);
    expect(booking.tables).toEqual([{ tableNumber: 1, assignedSeats: 2 }]);

    // Increase party size from 2 to 4
    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { partySize: 4 },
    });
    expect(patchRes.status()).toBe(200);

    const updated = (await patchRes.json()) as BookingResponse;
    expect(updated.partySize).toBe(4);
    // Now assigned to Table 2 (capacity 4)
    expect(updated.tables).toEqual([{ tableNumber: 2, assignedSeats: 4 }]);
  });

  test('R3: Reduces party size and frees unneeded seats in the slot', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([6]);

    const booking = await createBooking(loggedInRequest, slotId, 5);
    expect(await listedSlot(loggedInRequest, slotId)).toMatchObject({ freeSeats: 1 });

    // Reduce party size to 2
    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { partySize: 2 },
    });
    expect(patchRes.status()).toBe(200);

    const updated = (await patchRes.json()) as BookingResponse;
    expect(updated.partySize).toBe(2);
    expect(updated.tables).toEqual([{ tableNumber: 1, assignedSeats: 2 }]);

    // Slot now has 4 free seats
    expect(await listedSlot(loggedInRequest, slotId)).toMatchObject({ freeSeats: 4 });
  });

  test('R3: Changes only dietary requirements without affecting date or party size', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);

    const booking = await createBooking(loggedInRequest, slotId, 2, '1 vegetarian');

    const newRequirements = '1 vegan, 1 celiac (severe gluten allergy)';
    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { requirements: newRequirements },
    });
    expect(patchRes.status()).toBe(200);

    const updated = (await patchRes.json()) as BookingResponse;
    expect(updated.slotId).toBe(slotId);
    expect(updated.partySize).toBe(2);
    expect(updated.requirements).toBe(newRequirements);
  });

  test('R3: Clears dietary requirements by passing null', async ({ loggedInRequest }) => {
    const slotId = slot([4]);

    const booking = await createBooking(loggedInRequest, slotId, 2, 'No nuts');

    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { requirements: null },
    });
    expect(patchRes.status()).toBe(200);

    const updated = (await patchRes.json()) as BookingResponse;
    expect(updated.requirements == null || updated.requirements === '').toBe(true);
  });

  test('R3: Modifies date/time, party size, and requirements simultaneously in one request', async ({
    loggedInRequest,
  }) => {
    const sourceSlotId = slot([4]);
    const targetSlotId = slot([8]);

    const booking = await createBooking(loggedInRequest, sourceSlotId, 2, 'Vegetarian');

    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: {
        slotId: targetSlotId,
        partySize: 6,
        requirements: '2 vegans, 1 peanut allergy',
      },
    });
    expect(patchRes.status()).toBe(200);

    const updated = (await patchRes.json()) as BookingResponse;
    expect(updated.slotId).toBe(targetSlotId);
    expect(updated.partySize).toBe(6);
    expect(updated.requirements).toBe('2 vegans, 1 peanut allergy');
    expect(updated.tables).toEqual([{ tableNumber: 1, assignedSeats: 6 }]);
  });

  test('R5: Rejects change requested less than 48 hours before the booked slot with 422 Unprocessable Entity', async ({
    loggedInRequest,
  }) => {
    // Slot starting in ~24 hours is bookable (> 2h) but too late to modify (< 48h)
    const imminent48SlotId = slotWithin48Hours([4]);

    const booking = await createBooking(loggedInRequest, imminent48SlotId, 2);

    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { partySize: 3 },
    });
    expect(patchRes.status()).toBe(422);

    const body = await patchRes.json();
    expect(JSON.stringify(body)).toMatch(/48 hours/i);
  });

  test('R6: Rejects moving booking to an imminent target slot starting in under 2 hours with 422', async ({
    loggedInRequest,
  }) => {
    const validFutureSlotId = slot([4]);
    const imminentTargetSlotId = imminentSlot([4]);

    const booking = await createBooking(loggedInRequest, validFutureSlotId, 2);

    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { slotId: imminentTargetSlotId },
    });
    expect(patchRes.status()).toBe(422);
  });

  test('R7: Rejects party size increase that exceeds available table capacity with 409 Conflict', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);

    const booking = await createBooking(loggedInRequest, slotId, 3);

    // Attempt to increase to 6 guests when only 4 seats exist in total
    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { partySize: 6 },
    });
    expect(patchRes.status()).toBe(409);

    const body = await patchRes.json();
    expect(JSON.stringify(body)).toMatch(/Insufficient seats/i);

    // Verify original booking is unchanged
    expect(await listedSlot(loggedInRequest, slotId)).toMatchObject({ freeSeats: 1 });
  });

  test('R8: Splits updated party across multiple tables when no single table fits', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([3, 4]);

    const booking = await createBooking(loggedInRequest, slotId, 2);

    // Increase party to 6, requiring both table 1 (3 seats) and table 2 (3 seats)
    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { partySize: 6 },
    });
    expect(patchRes.status()).toBe(200);

    const updated = (await patchRes.json()) as BookingResponse;
    expect(updated.partySize).toBe(6);
    expect(updated.tables).toHaveLength(2);
    const totalAssigned = updated.tables.reduce((sum, t) => sum + t.assignedSeats, 0);
    expect(totalAssigned).toBe(6);
  });

  test('R1: Rejects unauthenticated change request with 401 Unauthorized', async ({ request }) => {
    const res = await request.patch('/api/bookings/1', {
      data: { partySize: 2 },
    });
    expect(res.status()).toBe(401);
  });

  test('R2: Forbids a hiker from modifying a booking owned by another hiker with 403 Forbidden', async ({
    playwright,
    baseURL,
    loggedInRequest,
  }) => {
    const slotId = slot([6]);

    // Hiker 1 creates booking
    const booking = await createBooking(loggedInRequest, slotId, 2);

    // Create a second hiker context
    const client2 = await playwright.request.newContext({ baseURL });
    const user2: TestUser = {
      email: `e2e-other-${crypto.randomUUID()}@example.test`,
      password: crypto.randomUUID(),
      fullName: 'Other Hiker',
      phone: '+39 333 9876543',
    };
    const regRes = await client2.post('/api/auth/register', { data: user2 });
    expect(regRes.status()).toBe(201);

    const loginRes = await client2.post('/api/auth/login', {
      data: { email: user2.email, password: user2.password },
    });
    expect(loginRes.status()).toBe(200);

    // Hiker 2 attempts to change Hiker 1's booking
    const patchRes = await client2.patch(`/api/bookings/${booking.id}`, {
      data: { partySize: 4 },
    });
    expect(patchRes.status()).toBe(403);

    const body = await patchRes.json();
    expect(JSON.stringify(body)).toMatch(/own bookings/i);

    await client2.dispose();
  });

  test('RBAC: Forbids staff member without hiker profile from changing bookings with 403 Forbidden', async ({
    loggedInRequest,
    employeeRequest,
  }) => {
    const slotId = slot([4]);

    const booking = await createBooking(loggedInRequest, slotId, 2);

    // Employee tries to change the booking via hiker endpoint
    const patchRes = await employeeRequest.patch(`/api/bookings/${booking.id}`, {
      data: { partySize: 3 },
    });
    expect(patchRes.status()).toBe(403);
  });

  test('R4: Rejects empty modification payload with 400 Bad Request', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);
    const booking = await createBooking(loggedInRequest, slotId, 2);

    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: {},
    });
    expect(patchRes.status()).toBe(400);

    const body = await patchRes.json();
    expect(JSON.stringify(body)).toMatch(/At least one field/i);
  });

  test('R4: Rejects invalid partySize (0 or negative) with 400 Bad Request', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);
    const booking = await createBooking(loggedInRequest, slotId, 2);

    const resZero = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { partySize: 0 },
    });
    expect(resZero.status()).toBe(400);

    const resNeg = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { partySize: -2 },
    });
    expect(resNeg.status()).toBe(400);
  });

  test('R4: Rejects invalid slotId (0 or negative) with 400 Bad Request', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);
    const booking = await createBooking(loggedInRequest, slotId, 2);

    const resZero = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { slotId: 0 },
    });
    expect(resZero.status()).toBe(400);

    const resNeg = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { slotId: -1 },
    });
    expect(resNeg.status()).toBe(400);
  });

  test('R4: Rejects requirements exceeding maximum length of 500 characters with 400 Bad Request', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);
    const booking = await createBooking(loggedInRequest, slotId, 2);

    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { requirements: 'A'.repeat(501) },
    });
    expect(patchRes.status()).toBe(400);
  });

  test('R4: Rejects requirements containing NUL character with 400 Bad Request', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);
    const booking = await createBooking(loggedInRequest, slotId, 2);

    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { requirements: 'peanut\u0000allergy' },
    });
    expect(patchRes.status()).toBe(400);
  });

  test('R9: Returns 404 Not Found when attempting to modify a non-existent booking ID', async ({
    loggedInRequest,
  }) => {
    const patchRes = await loggedInRequest.patch('/api/bookings/999999', {
      data: { partySize: 2 },
    });
    expect(patchRes.status()).toBe(404);
  });

  test('R9: Returns 404 Not Found when changing to a non-existent target slotId', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);
    const booking = await createBooking(loggedInRequest, slotId, 2);

    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: { slotId: 999999 },
    });
    expect(patchRes.status()).toBe(404);
  });

  test('Notification: Dispatches updated confirmation email via Mailpit reflecting modified booking', async ({
    loggedInRequest,
    registeredUser,
    request,
  }) => {
    const slotId = slot([6]);
    const booking = await createBooking(loggedInRequest, slotId, 2);

    // Modify party size and add allergy requirements
    const patchRes = await loggedInRequest.patch(`/api/bookings/${booking.id}`, {
      data: {
        partySize: 4,
        requirements: '1 severe peanut allergy',
      },
    });
    expect(patchRes.status()).toBe(200);

    // Wait for updated confirmation email
    const email = await waitForUpdatedBookingEmail(request, registeredUser.email);
    expect(email.Subject).toMatch(/Booking n\. \d+/i);
    const content = `${email.Text} ${email.HTML}`;
    expect(content).toContain('peanut allergy');
  });
});

test.describe('MH-06 Black-Box API: Planned Future Scenarios (TODOs)', () => {
  // TODO(MH-06): Test concurrent change requests competing for the same last remaining table
  test.skip('handles concurrent modification requests atomically without overselling seats', async () => { });

  // TODO(MH-06): Test rejecting change requests on cancelled or rejected bookings
  test.skip('rejects change request on a booking that was already cancelled or rejected', async () => { });

  // TODO(MH-06): Test rejection when target slot date falls during hut seasonal closure
  test.skip('rejects changing booking to a slot scheduled outside of seasonal opening days', async () => { });

  // TODO(MH-06): Test audit log recording old and new reservation details on modification
  test.skip('records audit log entry tracking previous and new booking state on change', async () => { });

  // TODO(MH-06): Test rate limiting when repeated change requests are sent in rapid succession
  test.skip('throttles excessive rapid change requests to protect database and email queue', async () => { });
});
