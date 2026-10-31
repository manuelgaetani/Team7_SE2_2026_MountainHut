import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { createImminentSlot, createSlot, deleteSlot } from '../../fixtures/db.js';

interface SlotSummary {
  id: number;
  freeSeats: number;
  availability: string;
}

let slotIds: number[] = [];

function slot(seats: number[]): number {
  const id = createSlot(seats);
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

test('reading the slots and booking require a session', async ({ request }) => {
  expect((await request.get('/api/slots')).status()).toBe(401);
  const response = await request.post('/api/bookings', { data: { slotId: 1, partySize: 1 } });
  expect(response.status()).toBe(401);
});

test('books the smallest table that fits and updates the free seats', async ({
  loggedInRequest,
}) => {
  const slotId = slot([2, 4, 6]);
  const response = await loggedInRequest.post('/api/bookings', { data: { slotId, partySize: 3 } });
  expect(response.status()).toBe(201);
  expect(await response.json()).toMatchObject({
    slotId,
    partySize: 3,
    status: 'CONFIRMED',
    tables: [{ tableNumber: 2, assignedSeats: 3 }],
  });
  expect(await listedSlot(loggedInRequest, slotId)).toMatchObject({
    freeSeats: 9,
    availability: 'AVAILABLE',
  });
});

test('splits a party that fits at no single table, using the smallest last table', async ({
  loggedInRequest,
}) => {
  const slotId = slot([6, 5, 2]);
  const response = await loggedInRequest.post('/api/bookings', { data: { slotId, partySize: 7 } });
  expect(response.status()).toBe(201);
  expect((await response.json()).tables).toEqual([
    { tableNumber: 1, assignedSeats: 6 },
    { tableNumber: 3, assignedSeats: 1 },
  ]);
});

test('accepts a party that takes all the seats, and the slot becomes full', async ({
  loggedInRequest,
}) => {
  const slotId = slot([4]);
  const response = await loggedInRequest.post('/api/bookings', { data: { slotId, partySize: 4 } });
  expect(response.status()).toBe(201);
  expect(await listedSlot(loggedInRequest, slotId)).toMatchObject({
    freeSeats: 0,
    availability: 'FULL',
  });
});

test('rejects a party larger than the free seats', async ({ loggedInRequest }) => {
  const slotId = slot([4]);
  const response = await loggedInRequest.post('/api/bookings', { data: { slotId, partySize: 5 } });
  expect(response.status()).toBe(409);
});

test('rejects a second booking of the same hiker for the slot', async ({ loggedInRequest }) => {
  const slotId = slot([4]);
  const data = { slotId, partySize: 1 };
  expect((await loggedInRequest.post('/api/bookings', { data })).status()).toBe(201);
  const second = await loggedInRequest.post('/api/bookings', { data });
  expect(second.status()).toBe(409);
  expect((await second.json()).message).toBe('You already have a booking for this slot');
});

test('rejects a slot that starts in less than two hours', async ({ loggedInRequest }) => {
  const slotId = createImminentSlot([4]);
  slotIds.push(slotId);
  expect(await listedSlot(loggedInRequest, slotId)).toMatchObject({ availability: 'TOO_LATE' });
  const response = await loggedInRequest.post('/api/bookings', { data: { slotId, partySize: 1 } });
  expect(response.status()).toBe(422);
});

test('rejects a slot that does not exist', async ({ loggedInRequest }) => {
  const response = await loggedInRequest.post('/api/bookings', {
    data: { slotId: 2_147_483_647, partySize: 1 },
  });
  expect(response.status()).toBe(404);
});

test('never gives the same seats to two hikers booking at the same time', async ({
  loggedInRequest,
  playwright,
  baseURL,
  request,
}) => {
  const slotId = slot([4]);
  const other: TestUser = {
    email: `e2e-${crypto.randomUUID()}@example.test`,
    password: crypto.randomUUID(),
    fullName: 'Other Hiker',
    phone: '+39 333 7654321',
  };
  expect((await request.post('/api/auth/register', { data: other })).status()).toBe(201);
  const otherRequest = await playwright.request.newContext({ baseURL });
  await otherRequest.post('/api/auth/login', {
    data: { email: other.email, password: other.password },
  });

  const data = { slotId, partySize: 3 };
  const responses = await Promise.all([
    loggedInRequest.post('/api/bookings', { data }),
    otherRequest.post('/api/bookings', { data }),
  ]);
  await otherRequest.dispose();

  expect(responses.map((r) => r.status()).sort()).toEqual([201, 409]);
  expect((await listedSlot(loggedInRequest, slotId)).freeSeats).toBe(1);
});
