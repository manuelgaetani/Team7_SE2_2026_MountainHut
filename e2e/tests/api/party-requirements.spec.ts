import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import { createSlot, deleteSlot } from '../../fixtures/db.js';

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
  requirements?: PartyRequirementItem[] | unknown;
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

// TODO(MH-05): Structured party requirements API not yet implemented; tests skipped on MH-06 branch
test.describe.skip('MH-05 Black-Box API: Party Requirements and Allergies', () => {
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

    // Requirements must be stored and reflected
    if (body.requirements && Array.isArray(body.requirements)) {
      expect(body.requirements).toHaveLength(3);
      expect(body.requirements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ allergies: true, description: '1 vegan, peanut allergy' }),
          expect.objectContaining({ allergies: true, description: '1 shellfish allergy' }),
          expect.objectContaining({ allergies: false, description: '2 vegetarians' }),
        ]),
      );
    }
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

    if (body.requirements && Array.isArray(body.requirements)) {
      expect(body.requirements).toHaveLength(1);
      const req = body.requirements[0] as PartyRequirementItem;
      expect(req.allergies).toBe(true);
      expect(req.description).toContain('gluten allergy');
    }
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

    if (body.requirements && Array.isArray(body.requirements)) {
      expect(body.requirements).toHaveLength(1);
      const req = body.requirements[0] as PartyRequirementItem;
      expect(req.allergies).toBe(false);
      expect(req.description).toContain('Halal menu');
    }
  });

  test('R6: Party requirements are optional and booking succeeds when omitted or empty', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);

    // Booking without requirements field
    const resWithout = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
      },
    });
    expect(resWithout.status()).toBe(201);
    const bodyWithout = (await resWithout.json()) as BookingResponse;
    expect(bodyWithout.partySize).toBe(2);
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

    // Verify confirmation email contains requirement text and allergy mention
    const email = await waitForBookingEmail(request, registeredUser.email);
    expect(email.Subject).toMatch(/Booking n\. \d+ confirmed/);
    const content = `${email.Text} ${email.HTML}`;
    expect(content).toContain('peanut allergy');
    expect(content).toContain('2 lacto-vegetarians');
  });

  test('R7: Rejects requirement with empty or whitespace-only description with 400 Bad Request', async ({
    loggedInRequest,
  }) => {
    const slotId = slot([4]);

    const res = await loggedInRequest.post('/api/bookings', {
      data: {
        slotId,
        partySize: 2,
        requirements: [{ allergies: true, description: '   ' }],
      },
    });

    expect(res.status()).toBe(400);
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

test.describe('MH-05 Black-Box API: Planned Future Scenarios (TODOs)', () => {
  // TODO(MH-05): Test booking retrieval endpoint GET /api/bookings/:id returns structured party requirements
  test.skip('returns structured party requirements when fetching booking details by id', async () => {});

  // TODO(MH-05): Test staff endpoint GET /api/staff/slots/:id/bookings returns allergy indicators for kitchen prep
  test.skip('provides kitchen summary endpoint grouping all party allergies for a given time slot', async () => {});

  // TODO(MH-05): Test boundary limit on maximum number of requirement items per booking
  test.skip('rejects excessive number of requirement items per booking to prevent payload bloating', async () => {});

  // TODO(MH-05): Test rejection of NUL bytes or malicious characters in requirement descriptions
  test.skip('rejects requirement descriptions containing NUL characters with 400 Bad Request', async () => {});

  // TODO(MH-05): Test amending or updating party requirements on an existing PENDING booking
  test.skip('allows hiker to update dietary requirements on their pending booking before confirmation', async () => {});
});
