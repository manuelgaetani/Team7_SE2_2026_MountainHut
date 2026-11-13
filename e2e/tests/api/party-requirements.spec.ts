import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import {
  countPartyRequirements,
  createImminentSlot,
  createSlot,
  deleteSlot,
  partyRequirements,
} from '../../fixtures/db.js';

interface PartyRequirementItem {
  allergies: boolean;
  description: string;
}

interface BookingResponse {
  id: number;
  slotId: number;
  partySize: number;
  status: string;
  tables: { tableNumber: number; assignedSeats: number }[];
  requirements: PartyRequirementItem[];
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

test.afterEach(() => {
  slotIds.forEach(deleteSlot);
  slotIds = [];
});

async function waitForBookingEmail(
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
      { message: `Waiting for confirmation email sent to ${to}`, timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1);

  const res = await request.get(`${MAILPIT_URL}/api/v1/message/${id}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as MailpitMessage;
}

test.describe('MH-05 Black-Box API: Party Requirements and Allergies', () => {
  test('R1, R2, R4 & R5: Books with multiple requirements for subsets of the party (allergies and dietary)', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4, 4]);

    const requirements: PartyRequirementItem[] = [
      { allergies: true, description: '1 vegan, peanut allergy' },
      { allergies: true, description: '1 shellfish allergy' },
      { allergies: false, description: '2 vegetarians' },
    ];

    const res = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 4,
        requirements,
      },
    });

    expect(res.status()).toBe(201);
    const body = (await res.json()) as BookingResponse;
    expect(body.slotId).toBe(slotId);
    expect(body.partySize).toBe(4);
    expect(body.status).toBe('PENDING');
    expect(body.requirements).toEqual(requirements);
  });

  test('R3: Single requirement with allergies flag checked notifies special care needed', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);

    const requirements: PartyRequirementItem[] = [
      { allergies: true, description: 'Severe celiac disease (gluten allergy)' },
    ];

    const res = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements,
      },
    });

    expect(res.status()).toBe(201);
    const body = (await res.json()) as BookingResponse;
    expect(body.partySize).toBe(2);
    expect(body.requirements).toEqual([
      { allergies: true, description: 'Severe celiac disease (gluten allergy)' },
    ]);
  });

  test('R5: Single requirement without allergies has allergies flag unset', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);

    const requirements: PartyRequirementItem[] = [
      { allergies: false, description: 'All guests prefer Halal menu options' },
    ];

    const res = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements,
      },
    });

    expect(res.status()).toBe(201);
    const body = (await res.json()) as BookingResponse;
    expect(body.partySize).toBe(2);
    expect(body.requirements).toEqual([
      { allergies: false, description: 'All guests prefer Halal menu options' },
    ]);
  });

  test('R6: Party requirements are optional and booking succeeds when omitted or empty', async ({
    loggedInRequest,
  }) => {
    const slotId1 = slot([4]);

    // Booking without requirements field
    const resWithout = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId: slotId1,
        partySize: 2,
      },
    });
    expect(resWithout.status()).toBe(201);
    const bodyWithout = (await resWithout.json()) as BookingResponse;
    expect(bodyWithout.partySize).toBe(2);
    expect(bodyWithout.requirements).toEqual([]);

    // Booking with empty requirements array
    const slotId2 = slot([4]);
    const resEmpty = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId: slotId2,
        partySize: 2,
        requirements: [],
      },
    });
    expect(resEmpty.status()).toBe(201);
    const bodyEmpty = (await resEmpty.json()) as BookingResponse;
    expect(bodyEmpty.partySize).toBe(2);
    expect(bodyEmpty.requirements).toEqual([]);
  });

  test('R4 & R7: Accepts up to the maximum count of 20 requirement items', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([8]);
    const requirements: PartyRequirementItem[] = Array.from({ length: 20 }, (_, i) => ({
      allergies: i % 2 === 0,
      description: `Requirement item ${i + 1}`,
    }));

    const res = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 4,
        requirements,
      },
    });

    expect(res.status()).toBe(201);
    const body = (await res.json()) as BookingResponse;
    expect(body.requirements).toHaveLength(20);
    expect(body.requirements).toEqual(requirements);
  });

  test('R7: Trims leading and trailing whitespace from requirement descriptions', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);

    const res = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: [{ allergies: true, description: '   1 vegan, peanut allergy   ' }],
      },
    });

    expect(res.status()).toBe(201);
    const body = (await res.json()) as BookingResponse;
    expect(body.requirements).toEqual([
      { allergies: true, description: '1 vegan, peanut allergy' },
    ]);
  });

  test('R8: Confirmation email received via Mailpit includes party requirements and allergy warnings', async ({
    loggedInRequest,
    registeredUser,
    request,
  }) => {
    const slotId = slot([6]);

    const res = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 3,
        requirements: [
          { allergies: true, description: '1 peanut allergy' },
          { allergies: false, description: '2 lacto-vegetarians' },
        ],
      },
    });
    expect(res.status()).toBe(201);

    // Verify confirmation email contains requirement text and allergy special care mention
    const email = await waitForBookingEmail(request, registeredUser.email);
    expect(email.Subject).toMatch(/Booking n\. \d+ confirmed/);
    expect(email.Text).toContain('Requirements:');
    expect(email.Text).toContain('Allergies (special care needed): 1 peanut allergy');
    expect(email.Text).toContain('2 lacto-vegetarians');
    expect(email.HTML).toContain(
      'Allergies (special care needed): 1 peanut allergy<br>2 lacto-vegetarians',
    );
  });

  test('R8: Confirmation email omits Requirements section when requirements are empty or omitted', async ({
    loggedInRequest,
    registeredUser,
    request,
  }) => {
    const slotId = slot([4]);

    const res = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: [],
      },
    });
    expect(res.status()).toBe(201);

    const email = await waitForBookingEmail(request, registeredUser.email);
    expect(email.Subject).toMatch(/Booking n\. \d+ confirmed/);
    expect(email.Text).not.toContain('Requirements');
    expect(email.HTML).not.toContain('Requirements');
  });

  test('R8: Prevents HTML injection in confirmation email from party requirements', async ({
    loggedInRequest,
    registeredUser,
    request,
  }) => {
    const slotId = slot([4]);

    const res = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: [{ allergies: false, description: '<script>alert(1)</script> & "salt"' }],
      },
    });
    expect(res.status()).toBe(201);

    const email = await waitForBookingEmail(request, registeredUser.email);
    expect(email.Text).toContain('<script>alert(1)</script> & "salt"');
    expect(email.HTML).not.toContain('<script>');
    expect(email.HTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;salt&quot;');
  });

  test('R7: Rejects requirement with empty or whitespace-only description with 400 Bad Request', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);

    const resEmpty = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: [{ allergies: true, description: '' }],
      },
    });
    expect(resEmpty.status()).toBe(400);

    const resWhitespace = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: [{ allergies: true, description: '   ' }],
      },
    });
    expect(resWhitespace.status()).toBe(400);
  });

  test('R7: Rejects requirement description exceeding maximum length limit (500 characters) with 400', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);

    const res = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: [{ allergies: false, description: 'A'.repeat(501) }],
      },
    });

    expect(res.status()).toBe(400);
  });

  test('R7: Rejects requirement descriptions containing NUL characters with 400 Bad Request', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);

    const res = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: [{ allergies: false, description: 'no\u0000nuts' }],
      },
    });

    expect(res.status()).toBe(400);
  });

  test('R7: Rejects excessive number of requirement items (> 20) with 400 Bad Request', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);
    const requirements: PartyRequirementItem[] = Array.from({ length: 21 }, (_, i) => ({
      allergies: false,
      description: `Requirement item ${i + 1}`,
    }));

    const res = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements,
      },
    });

    expect(res.status()).toBe(400);
  });

  test('R7: Rejects requirement when provided as a string or non-array with 400 Bad Request', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);

    const resString = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: '1 vegan, peanut allergy',
      },
    });
    expect(resString.status()).toBe(400);

    const resObject = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: { allergies: true, description: 'peanut allergy' },
      },
    });
    expect(resObject.status()).toBe(400);
  });

  test('R7: Rejects requirement with invalid payload types with 400 Bad Request', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);

    // Invalid non-boolean allergies flag
    const resInvalidFlag = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: [{ allergies: 'yes', description: 'Gluten free' }],
      },
    });
    expect(resInvalidFlag.status()).toBe(400);

    // Missing description
    const resMissingDesc = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: [{ allergies: true }],
      },
    });
    expect(resMissingDesc.status()).toBe(400);

    // Missing allergies flag
    const resMissingFlag = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: [{ description: 'Gluten free' }],
      },
    });
    expect(resMissingFlag.status()).toBe(400);
  });

  test('Authentication: Rejects booking with requirements when unauthenticated with 401', async ({
    request,
  }) => {
    const slotId = slot([4]);

    const res = await request.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: [{ allergies: true, description: '1 nut allergy' }],
      },
    });

    expect(res.status()).toBe(401);
  });

  test('RBAC: Forbids staff member without hiker profile from booking with requirements with 403', async ({
    employeeRequest,
  }) => {
    const slotId = slot([4]);

    const res = await employeeRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: [{ allergies: false, description: '2 vegans' }],
      },
    });

    expect(res.status()).toBe(403);
  });
});

// The story example: three requirements for subsets of a party of 4.
const STORY_EXAMPLE: PartyRequirementItem[] = [
  { allergies: true, description: '1 vegan, peanut allergy' },
  { allergies: true, description: '1 shellfish allergy' },
  { allergies: false, description: '2 vegetarians' },
];

test.describe('MH-05 Black-Box API: Story example and boundaries', () => {
  test('R3, R4 & R8: Confirmation email lists the story example in order, flagging only the allergies', async ({
    loggedInRequest,
    registeredUser,
    request,
  }) => {
    const res = await loggedInRequest.post('/api/bookings', {
      data: { slotId: slot([4]), partySize: 4, requirements: STORY_EXAMPLE },
    });
    expect(res.status()).toBe(201);

    // The email is built from the stored booking, not from the request: one line per requirement.
    const email = await waitForBookingEmail(request, registeredUser.email);
    // SMTP delivers the text with CRLF line endings.
    const text = email.Text.replaceAll('\r\n', '\n');
    expect(text).toContain(
      [
        'Requirements: Allergies (special care needed): 1 vegan, peanut allergy',
        'Allergies (special care needed): 1 shellfish allergy',
        '2 vegetarians',
      ].join('\n'),
    );
    expect(text).not.toContain('Allergies (special care needed): 2 vegetarians');
  });

  test('R7: Accepts a description of exactly 500 characters and stores it whole', async ({
    loggedInRequest,
  }) => {
    const description = 'A'.repeat(500);

    const res = await loggedInRequest.post('/api/bookings', {
      data: { slotId: slot([4]), partySize: 2, requirements: [{ allergies: false, description }] },
    });

    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as BookingResponse;
    expect(partyRequirements(id)).toEqual([{ allergies: false, description }]);
  });
});

test.describe('MH-05 Gray-Box API: Stored party requirements', () => {
  test('R2, R4 & R8: Stores the story example in the database, in order and with each allergies flag', async ({
    loggedInRequest,
  }) => {
    const res = await loggedInRequest.post('/api/bookings', {
      data: { slotId: slot([4]), partySize: 4, requirements: STORY_EXAMPLE },
    });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as BookingResponse;

    // The response only echoes the request: the database shows what the hut will read.
    expect(partyRequirements(id)).toEqual(STORY_EXAMPLE);
  });

  test('R6: Stores no requirements for a booking made without them', async ({
    loggedInRequest,
  }) => {
    const res = await loggedInRequest.post('/api/bookings', {
      data: { slotId: slot([4]), partySize: 2 },
    });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as BookingResponse;

    expect(partyRequirements(id)).toEqual([]);
  });

  test('R8: Stores the trimmed description, not the text as typed', async ({ loggedInRequest }) => {
    const res = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId: slot([4]),
        partySize: 2,
        requirements: [{ allergies: true, description: '  1 shellfish allergy  ' }],
      },
    });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as BookingResponse;

    expect(partyRequirements(id)).toEqual([
      { allergies: true, description: '1 shellfish allergy' },
    ]);
  });

  test('R8: A booking refused for missing seats (409) leaves no requirements behind', async ({
    loggedInRequest,
  }) => {
    // A unique description finds the rows of this test only, as no booking id is returned.
    const description = `peanut allergy ${randomUUID()}`;

    const res = await loggedInRequest.post('/api/bookings', {
      data: { slotId: slot([2]), partySize: 4, requirements: [{ allergies: true, description }] },
    });

    expect(res.status()).toBe(409);
    expect(countPartyRequirements(description)).toBe(0);
  });

  test('R8: A booking refused because the slot starts too soon (422) leaves no requirements behind', async ({
    loggedInRequest,
  }) => {
    const description = `shellfish allergy ${randomUUID()}`;
    const slotId = createImminentSlot([4]);
    slotIds.push(slotId);

    const res = await loggedInRequest.post('/api/bookings', {
      data: { slotId, partySize: 2, requirements: [{ allergies: true, description }] },
    });

    expect(res.status()).toBe(422);
    expect(countPartyRequirements(description)).toBe(0);
  });
});

test.describe('MH-05 Black-Box API: Planned Future Scenarios (TODOs)', () => {
  // TODO(MH-05): Test booking retrieval endpoint GET /api/bookings/:id returns structured party requirements
  test.skip('returns structured party requirements when fetching booking details by id', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);
    const requirements: PartyRequirementItem[] = [
      { allergies: true, description: '1 severe celiac (gluten allergy)' },
      { allergies: false, description: '1 vegetarian' },
    ];

    const createRes = await loggedInRequest.post('/api/bookings', {
      data: { slotId, partySize: 2, requirements },
    });
    expect(createRes.status()).toBe(201);
    const { id: bookingId } = (await createRes.json()) as BookingResponse;

    const getRes = await loggedInRequest.get(`/api/bookings/${bookingId}`);
    expect(getRes.status()).toBe(200);
    const body = (await getRes.json()) as BookingResponse;
    expect(body.id).toBe(bookingId);
    expect(body.requirements).toEqual(requirements);
  });

  // TODO(MH-05): Test staff endpoint GET /api/staff/slots/:id/bookings returns allergy indicators for kitchen prep
  test.skip('provides kitchen summary endpoint grouping all party allergies for a given time slot', async ({
    loggedInRequest,
    employeeRequest,
  }) => {
    const slotId = slot([6]);
    await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 3,
        requirements: [
          { allergies: true, description: '1 peanut allergy' },
          { allergies: false, description: '2 vegans' },
        ],
      },
    });

    const staffRes = await employeeRequest.get(`/api/staff/slots/${slotId}/bookings`);
    expect(staffRes.status()).toBe(200);
    const bookings = (await staffRes.json()) as BookingResponse[];
    expect(bookings.length).toBeGreaterThanOrEqual(1);
    const target = bookings.find((b) => b.slotId === slotId);
    expect(target).toBeDefined();
    expect(target?.requirements).toContainEqual({
      allergies: true,
      description: '1 peanut allergy',
    });
  });

  // TODO(MH-05): Test amending or updating party requirements on an existing PENDING booking
  test.skip('allows hiker to update dietary requirements on their pending booking before confirmation', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);
    const initialRequirements: PartyRequirementItem[] = [
      { allergies: false, description: '2 vegetarians' },
    ];

    const createRes = await loggedInRequest.post('/api/bookings', {
      data: { slotId, partySize: 2, requirements: initialRequirements },
    });
    expect(createRes.status()).toBe(201);
    const { id: bookingId } = (await createRes.json()) as BookingResponse;

    const updatedRequirements: PartyRequirementItem[] = [
      { allergies: true, description: '1 vegan, peanut allergy' },
      { allergies: false, description: '1 vegetarian' },
    ];

    const patchRes = await loggedInRequest.patch(`/api/bookings/${bookingId}`, {
      data: { requirements: updatedRequirements },
    });
    expect(patchRes.status()).toBe(200);
    const body = (await patchRes.json()) as BookingResponse;
    expect(body.requirements).toEqual(updatedRequirements);
  });

  // TODO(MH-04): When merged with story MH-04 (Check availability), verify capacity reduction after booking with party requirements
  test.skip('When merged with MH-04: Availability check reflects capacity reduction after booking with party requirements', async () => {});
});
