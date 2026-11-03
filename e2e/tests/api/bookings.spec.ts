import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import {
  bookingStatus,
  createImminentSlot,
  createPastSlot,
  createSlot,
  deleteSlot,
  removeHikerProfile,
} from '../../fixtures/db.js';

interface SlotSummary {
  id: number;
  freeSeats: number;
  availability: string;
}

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';

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

interface MailpitMessage {
  ID: string;
  Subject: string;
  Text: string;
}

// The API sends the email after answering, so it can arrive a moment later.
async function confirmationEmail(request: APIRequestContext, to: string): Promise<MailpitMessage> {
  const query = encodeURIComponent(`to:"${to}"`);
  let id: string | undefined;
  await expect
    .poll(async () => {
      const response = await request.get(`${MAILPIT_URL}/api/v1/search?query=${query}`);
      const { messages } = (await response.json()) as { messages: { ID: string }[] };
      id = messages[0]?.ID;
      return messages.length;
    })
    .toBe(1);
  const response = await request.get(`${MAILPIT_URL}/api/v1/message/${id}`);
  return (await response.json()) as MailpitMessage;
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
    status: 'PENDING',
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

test('emails the hiker a confirmation with the details of the booking', async ({
  loggedInRequest,
  registeredUser,
  request,
}) => {
  const slotId = slot([4]);
  const response = await loggedInRequest.post('/api/bookings', {
    data: { slotId, partySize: 3, requirements: 'One nut allergy' },
  });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: number };

  const message = await confirmationEmail(request, registeredUser.email);
  expect(message.Subject).toContain(`Booking n. ${id} confirmed`);
  expect(message.Text).toContain(`Booking n.: ${id}`);
  expect(message.Text).toContain(`Name: ${registeredUser.fullName}`);
  expect(message.Text).toContain('Time: 19:00 - 21:00');
  expect(message.Text).toContain('People: 3 people');
  expect(message.Text).toContain('Requirements: One nut allergy');
});

test('confirms the booking once its confirmation email is sent', async ({ loggedInRequest }) => {
  const response = await loggedInRequest.post('/api/bookings', {
    data: { slotId: slot([4]), partySize: 2 },
  });
  expect(response.status()).toBe(201);
  const { id, status } = (await response.json()) as { id: number; status: string };
  expect(status).toBe('PENDING');

  await expect.poll(() => bookingStatus(id)).toBe('CONFIRMED');
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

// Another hiker, registered and logged in, with a client of its own.
async function otherHiker(
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string | undefined,
): Promise<APIRequestContext> {
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
  return client;
}

test.describe('table assignment', () => {
  test('shares a table already used by another party when the party fits', async ({
    loggedInRequest,
    playwright,
    baseURL,
  }) => {
    const slotId = slot([6, 4]);
    const other = await otherHiker(playwright, baseURL);
    const first = await other.post('/api/bookings', { data: { slotId, partySize: 2 } });
    expect((await first.json()).tables).toEqual([{ tableNumber: 2, assignedSeats: 2 }]);
    await other.dispose();

    const response = await loggedInRequest.post('/api/bookings', {
      data: { slotId, partySize: 2 },
    });
    expect(response.status()).toBe(201);
    expect((await response.json()).tables).toEqual([{ tableNumber: 2, assignedSeats: 2 }]);
  });

  // The product owner's example in issue #11: a partly used table with exactly enough
  // free seats is preferred to an empty table with more seats.
  test('prefers the partly used table with the fewest free seats that fit', async ({
    loggedInRequest,
    playwright,
    baseURL,
  }) => {
    const slotId = slot([6, 6]);
    const other = await otherHiker(playwright, baseURL);
    expect((await other.post('/api/bookings', { data: { slotId, partySize: 2 } })).status()).toBe(
      201,
    );
    await other.dispose();

    const response = await loggedInRequest.post('/api/bookings', {
      data: { slotId, partySize: 4 },
    });
    expect((await response.json()).tables).toEqual([{ tableNumber: 1, assignedSeats: 4 }]);
  });

  test('splits a party over as few tables as possible', async ({ loggedInRequest }) => {
    const slotId = slot([2, 2, 2, 5]);
    const response = await loggedInRequest.post('/api/bookings', {
      data: { slotId, partySize: 7 },
    });
    expect(response.status()).toBe(201);
    const tables = (await response.json()).tables as {
      tableNumber: number;
      assignedSeats: number;
    }[];
    expect(tables).toHaveLength(2);
    expect(tables).toContainEqual({ tableNumber: 4, assignedSeats: 5 });
    expect(tables.reduce((sum, t) => sum + t.assignedSeats, 0)).toBe(7);
  });
});

test.describe('capacity', () => {
  test('counts the seats booked by every hiker', async ({
    loggedInRequest,
    playwright,
    baseURL,
  }) => {
    const slotId = slot([4, 2]);
    for (const partySize of [4, 2]) {
      const other = await otherHiker(playwright, baseURL);
      expect((await other.post('/api/bookings', { data: { slotId, partySize } })).status()).toBe(
        201,
      );
      await other.dispose();
    }

    const response = await loggedInRequest.post('/api/bookings', {
      data: { slotId, partySize: 1 },
    });
    expect(response.status()).toBe(409);
    expect(await listedSlot(loggedInRequest, slotId)).toMatchObject({
      freeSeats: 0,
      availability: 'FULL',
    });
  });

  // MH-02, issue #17: a slot without tables has 0 seats and cannot be booked.
  test('treats a slot without tables as full', async ({ loggedInRequest }) => {
    const slotId = slot([]);
    expect(await listedSlot(loggedInRequest, slotId)).toMatchObject({
      freeSeats: 0,
      availability: 'FULL',
    });
    const response = await loggedInRequest.post('/api/bookings', {
      data: { slotId, partySize: 1 },
    });
    expect(response.status()).toBe(409);
  });

  // Issue #27: no minimum or maximum party size, only the free seats limit it.
  test('has no maximum party size beyond the free seats', async ({ loggedInRequest }) => {
    const small = slot([4]);
    const tooMany = await loggedInRequest.post('/api/bookings', {
      data: { slotId: small, partySize: 1000 },
    });
    expect(tooMany.status()).toBe(409);

    const large = slot([500, 500]);
    const response = await loggedInRequest.post('/api/bookings', {
      data: { slotId: large, partySize: 1000 },
    });
    expect(response.status()).toBe(201);
    expect((await response.json()).tables).toHaveLength(2);
  });
});

test.describe('slots that can be booked', () => {
  test('does not list or book a slot that is already over', async ({ loggedInRequest }) => {
    const slotId = createPastSlot([4]);
    slotIds.push(slotId);
    const listed = (await (await loggedInRequest.get('/api/slots')).json()) as SlotSummary[];
    expect(listed.map((s) => s.id)).not.toContain(slotId);

    const response = await loggedInRequest.post('/api/bookings', {
      data: { slotId, partySize: 1 },
    });
    expect(response.status()).toBe(422);
  });

  // Issue #25: one booking per slot, not one per hiker or per day.
  test('lets a hiker book different slots', async ({ loggedInRequest }) => {
    for (const slotId of [slot([4]), slot([4])]) {
      const response = await loggedInRequest.post('/api/bookings', {
        data: { slotId, partySize: 2 },
      });
      expect(response.status()).toBe(201);
    }
  });
});

test.describe('request validation', () => {
  const invalidBodies: [string, Record<string, unknown>][] = [
    ['a party of 0', { partySize: 0 }],
    ['a negative party', { partySize: -1 }],
    ['a fractional party', { partySize: 2.5 }],
    ['a party size sent as text', { partySize: '3' }],
    ['no party size', {}],
  ];

  for (const [name, body] of invalidBodies) {
    test(`rejects ${name}`, async ({ loggedInRequest }) => {
      const response = await loggedInRequest.post('/api/bookings', {
        data: { slotId: slot([4]), ...body },
      });
      expect(response.status()).toBe(400);
    });
  }

  test('rejects a booking without a slot', async ({ loggedInRequest }) => {
    const response = await loggedInRequest.post('/api/bookings', { data: { partySize: 2 } });
    expect(response.status()).toBe(400);
  });
});

test('refuses a booking from an account without a hiker profile', async ({
  playwright,
  baseURL,
  request,
  newUser,
}) => {
  expect((await request.post('/api/auth/register', { data: newUser })).status()).toBe(201);
  removeHikerProfile(newUser.email);
  const client = await playwright.request.newContext({ baseURL });
  await client.post('/api/auth/login', {
    data: { email: newUser.email, password: newUser.password },
  });

  const response = await client.post('/api/bookings', {
    data: { slotId: slot([4]), partySize: 1 },
  });
  await client.dispose();
  expect(response.status()).toBe(403);
});
