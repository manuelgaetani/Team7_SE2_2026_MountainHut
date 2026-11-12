import { randomUUID } from 'node:crypto';
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import type { PartyRequirement } from '@mountain-hut/shared';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import { bookingStatus, createSlot, deleteSlot } from '../../fixtures/db.js';
import { emailCount, waitForEmails } from '../../fixtures/mailpit.js';

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

// Books the slot and returns the number of the booking.
async function book(
  client: APIRequestContext,
  slotId: number,
  partySize: number,
  requirements?: PartyRequirement[],
): Promise<number> {
  const response = await client.post('/api/bookings', {
    data: { slotId, partySize, requirements },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: number }).id;
}

// Another hiker, registered and logged in, with a client of its own.
async function secondHiker(
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string | undefined,
  request: APIRequestContext,
): Promise<{ client: APIRequestContext; user: TestUser }> {
  const user: TestUser = {
    email: `e2e-${randomUUID()}@example.test`,
    password: randomUUID(),
    fullName: 'Second Hiker',
    phone: '+39 333 7654321',
  };
  expect((await request.post('/api/auth/register', { data: user })).status()).toBe(201);
  const client = await playwright.request.newContext({ baseURL });
  const login = await client.post('/api/auth/login', {
    data: { email: user.email, password: user.password },
  });
  expect(login.status()).toBe(200);
  return { client, user };
}

test('the email says the date and the time of the slot', async ({
  loggedInRequest,
  registeredUser,
  request,
}) => {
  const slotId = slot([4]);
  const listed = (await (await loggedInRequest.get('/api/slots')).json()) as {
    id: number;
    date: string;
  }[];
  const { date } = listed.find((s) => s.id === slotId)!;

  await book(loggedInRequest, slotId, 2);

  const [message] = await waitForEmails(request, registeredUser.email, 1);
  // Only the year: adapt it to the date format of the email template.
  expect(message.Text).toContain(date.slice(0, 4));
  expect(message.Text).toContain('Time: 19:00 - 21:00');
});

test('a refused booking sends no email', async ({ loggedInRequest, registeredUser, request }) => {
  const full = slot([2]);
  const open = slot([4]);

  const refused = await loggedInRequest.post('/api/bookings', {
    data: { slotId: full, partySize: 5 },
  });
  expect(refused.status()).toBe(409);
  const accepted = await book(loggedInRequest, open, 2);

  // Exactly one email, and it is the one of the accepted booking: the refused one sent none.
  const [message] = await waitForEmails(request, registeredUser.email, 1);
  expect(message.Subject).toContain(`Booking n. ${accepted}`);
});

test('every hiker gets the email of their own booking only', async ({
  loggedInRequest,
  registeredUser,
  playwright,
  baseURL,
  request,
}) => {
  const { client, user: other } = await secondHiker(playwright, baseURL, request);
  const mine = await book(loggedInRequest, slot([4]), 2);
  const theirs = await book(client, slot([4]), 3);
  await client.dispose();

  const [toMe] = await waitForEmails(request, registeredUser.email, 1);
  const [toOther] = await waitForEmails(request, other.email, 1);
  expect(toMe.Text).toContain(`Booking n.: ${mine}`);
  expect(toMe.Text).toContain(`Name: ${registeredUser.fullName}`);
  expect(toMe.Text).not.toContain(`Booking n.: ${theirs}`);
  expect(toOther.Text).toContain(`Booking n.: ${theirs}`);
  expect(toOther.Text).toContain(`Name: ${other.fullName}`);
  expect(toOther.Text).not.toContain(`Booking n.: ${mine}`);
});

test('the email is sent only once', async ({ loggedInRequest, registeredUser, request }) => {
  const id = await book(loggedInRequest, slot([4]), 2);

  await waitForEmails(request, registeredUser.email, 1);
  await expect.poll(() => bookingStatus(id)).toBe('CONFIRMED');

  expect(await emailCount(request, registeredUser.email)).toBe(1);
});

test('the requirements cannot inject HTML in the email', async ({
  loggedInRequest,
  registeredUser,
  request,
}) => {
  const requirements: PartyRequirement[] = [
    { allergies: false, description: '<script>alert(1)</script> & "salt"' },
  ];
  await book(loggedInRequest, slot([4]), 2, requirements);

  const [message] = await waitForEmails(request, registeredUser.email, 1);
  expect(message.Text).toContain('<script>alert(1)</script> & "salt"');
  expect(message.HTML).not.toContain('<script>');
  expect(message.HTML).toContain('&lt;script&gt;');
});
