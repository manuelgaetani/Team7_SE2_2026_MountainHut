import { randomInt, randomUUID } from 'node:crypto';
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import type { TestUser } from '../../fixtures/auth.js';
import {
  createImminentSlot,
  createPastSlot,
  createSlot,
  deleteSlot,
  slotStart,
} from '../../fixtures/db.js';

interface TableAllocation {
  tableNumber: number;
  seats: number;
}

interface AvailabilityResponse {
  available: boolean;
  date: string;
  time: string;
  partySize: number;
  totalFreeSeats?: number;
  tables?: TableAllocation[];
  breakdown?: number[];
  breakdownText?: string;
  reason?: 'NO_SLOT' | 'INSUFFICIENT_SEATS' | 'TOO_LATE';
}

interface SlotSummary {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  freeSeats: number;
  availability: 'AVAILABLE' | 'FULL' | 'TOO_LATE';
}

let slotIds: number[] = [];

test.afterEach(() => {
  slotIds.forEach(deleteSlot);
  slotIds = [];
});

function trackSlot(id: number): number {
  slotIds.push(id);
  return id;
}

// Generates an isolated calendar date so parallel tests never collide.
function uniqueDate(): string {
  const dayOffset = randomInt(5000, 25000);
  const d = new Date(Date.UTC(2035, 0, 1) + dayOffset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// Creates an independent hiker user via public API for booking isolation.
async function createHiker(
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string | undefined,
  request: APIRequestContext,
): Promise<{ client: APIRequestContext; user: TestUser }> {
  const user: TestUser = {
    email: `e2e-${randomUUID()}@example.test`,
    password: randomUUID(),
    fullName: 'Independent Hiker',
    phone: '+39 333 1122334',
  };
  const reg = await request.post('/api/auth/register', { data: user });
  expect(reg.status()).toBe(201);

  const client = await playwright.request.newContext({ baseURL });
  const login = await client.post('/api/auth/login', {
    data: { email: user.email, password: user.password },
  });
  expect(login.status()).toBe(200);
  return { client, user };
}

// =============================================================================
// 1. BLACK-BOX E2E API TESTS (Requirements R1..R7 & Acceptance Criteria)
// =============================================================================

test.describe('MH-04 Black-Box API: Functional Specifications', () => {
  test('R1 & R4: Public check without login returns availability and table breakdown for single table', async ({
    employeeRequest,
    request,
  }) => {
    const testDate = uniqueDate();

    // Staff creates slot with tables via public API
    const slotRes = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '12:00',
        endTime: '13:30',
        tables: [{ tableNumber: 1, seats: 4 }],
      },
    });
    expect(slotRes.status()).toBe(201);
    const { id } = (await slotRes.json()) as { id: number };
    trackSlot(id);

    // Public client (no auth cookies) checks availability for 3 people
    const checkRes = await request.get(`/api/availability?date=${testDate}&time=12:00&partySize=3`);
    expect(checkRes.status()).toBe(200);

    const body = (await checkRes.json()) as AvailabilityResponse;
    expect(body.available).toBe(true);
    expect(body.date).toBe(testDate);
    expect(body.time).toBe('12:00');
    expect(body.partySize).toBe(3);
    expect(body.totalFreeSeats).toBe(4);
    expect(body.tables).toEqual([{ tableNumber: 1, seats: 3 }]);
    expect(body.breakdown).toEqual([3]);
    expect(body.breakdownText).toBe('3 seats');
  });

  test('R4: Multi-table layout breakdown is provided when party spans multiple tables', async ({
    employeeRequest,
    request,
  }) => {
    const testDate = uniqueDate();

    // Slot with 3 tables of 2 seats each (6 seats total)
    const slotRes = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '13:00',
        endTime: '14:30',
        tables: [
          { tableNumber: 1, seats: 2 },
          { tableNumber: 2, seats: 2 },
          { tableNumber: 3, seats: 2 },
        ],
      },
    });
    expect(slotRes.status()).toBe(201);
    const { id } = (await slotRes.json()) as { id: number };
    trackSlot(id);

    // Public client checks for 6 people
    const checkRes = await request.get(`/api/availability?date=${testDate}&time=13:00&partySize=6`);
    expect(checkRes.status()).toBe(200);

    const body = (await checkRes.json()) as AvailabilityResponse;
    expect(body.available).toBe(true);
    expect(body.partySize).toBe(6);
    expect(body.breakdown).toEqual([2, 2, 2]);
    expect(body.breakdownText).toBe('2 + 2 + 2 seats');
    expect(body.tables).toHaveLength(3);
  });

  test('R5: Responds unavailable when requested party size exceeds free seats', async ({
    employeeRequest,
    request,
  }) => {
    const testDate = uniqueDate();

    const slotRes = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '19:00',
        endTime: '20:30',
        tables: [{ tableNumber: 1, seats: 4 }],
      },
    });
    expect(slotRes.status()).toBe(201);
    const { id } = (await slotRes.json()) as { id: number };
    trackSlot(id);

    // Request 5 seats when only 4 exist
    const checkRes = await request.get(`/api/availability?date=${testDate}&time=19:00&partySize=5`);
    expect(checkRes.status()).toBe(200);

    const body = (await checkRes.json()) as AvailabilityResponse;
    expect(body.available).toBe(false);
    expect(body.partySize).toBe(5);
    expect(body.reason).toBe('INSUFFICIENT_SEATS');
    expect(body.totalFreeSeats).toBe(4);
    expect(body.tables).toBeUndefined();
  });

  test('R6 & R7: Responds unavailable when no slot exists and suggests no alternatives', async ({
    request,
  }) => {
    const nonExistentDate = uniqueDate();

    const checkRes = await request.get(
      `/api/availability?date=${nonExistentDate}&time=15:00&partySize=2`,
    );
    expect(checkRes.status()).toBe(200);

    const body = (await checkRes.json()) as AvailabilityResponse & {
      alternativeSlots?: unknown;
      suggestions?: unknown;
    };
    expect(body.available).toBe(false);
    expect(body.reason).toBe('NO_SLOT');
    expect(body.alternativeSlots).toBeUndefined();
    expect(body.suggestions).toBeUndefined();
  });

  test('R2: Rejects invalid query parameters with 400 Bad Request', async ({ request }) => {
    const testDate = uniqueDate();

    // 1. Party size 0 or negative
    expect(
      (await request.get(`/api/availability?date=${testDate}&time=12:00&partySize=0`)).status(),
    ).toBe(400);
    expect(
      (await request.get(`/api/availability?date=${testDate}&time=12:00&partySize=-2`)).status(),
    ).toBe(400);

    // 2. Invalid date format
    expect(
      (await request.get(`/api/availability?date=not-a-date&time=12:00&partySize=2`)).status(),
    ).toBe(400);

    // 3. Invalid time format
    expect(
      (await request.get(`/api/availability?date=${testDate}&time=25:99&partySize=2`)).status(),
    ).toBe(400);
  });

  // Implemented from former TODO: Upper boundary handling
  test('handles maximum integer boundary for party size gracefully without server error', async ({
    employeeRequest,
    request,
  }) => {
    const testDate = uniqueDate();

    const slotRes = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '12:00',
        endTime: '13:00',
        tables: [{ tableNumber: 1, seats: 4 }],
      },
    });
    expect(slotRes.status()).toBe(201);
    const { id } = (await slotRes.json()) as { id: number };
    trackSlot(id);

    // Valid max integer: 2147483647
    const maxIntRes = await request.get(
      `/api/availability?date=${testDate}&time=12:00&partySize=2147483647`,
    );
    expect(maxIntRes.status()).toBe(200);
    const maxBody = (await maxIntRes.json()) as AvailabilityResponse;
    expect(maxBody.available).toBe(false);
    expect(maxBody.reason).toBe('INSUFFICIENT_SEATS');

    // Exceeds max integer: 2147483648 -> rejected by Zod schema
    const overflowRes = await request.get(
      `/api/availability?date=${testDate}&time=12:00&partySize=2147483648`,
    );
    expect(overflowRes.status()).toBe(400);
  });

  // Implemented from former TODO: Stateless public endpoint check
  test('verifies public availability response sets no session or tracking cookies', async ({
    employeeRequest,
    request,
  }) => {
    const testDate = uniqueDate();

    const slotRes = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '12:00',
        endTime: '13:00',
        tables: [{ tableNumber: 1, seats: 4 }],
      },
    });
    expect(slotRes.status()).toBe(201);
    const { id } = (await slotRes.json()) as { id: number };
    trackSlot(id);

    const checkRes = await request.get(`/api/availability?date=${testDate}&time=12:00&partySize=2`);
    expect(checkRes.status()).toBe(200);

    const cookies = checkRes.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
    expect(cookies).toHaveLength(0);
  });

  // Implemented from former TODO: Real-time availability reduction upon booking
  test('updates available table breakdown dynamically after another hiker books seats', async ({
    employeeRequest,
    request,
    playwright,
    baseURL,
  }) => {
    const testDate = uniqueDate();

    // Slot with Table 1 (4 seats) and Table 2 (4 seats)
    const slotRes = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '12:00',
        endTime: '13:30',
        tables: [
          { tableNumber: 1, seats: 4 },
          { tableNumber: 2, seats: 4 },
        ],
      },
    });
    expect(slotRes.status()).toBe(201);
    const { id: slotId } = (await slotRes.json()) as { id: number };
    trackSlot(slotId);

    // Initial check: 6 people fit across both tables
    const checkBefore = await request.get(
      `/api/availability?date=${testDate}&time=12:00&partySize=6`,
    );
    expect(checkBefore.status()).toBe(200);
    const beforeBody = (await checkBefore.json()) as AvailabilityResponse;
    expect(beforeBody.available).toBe(true);
    expect(beforeBody.totalFreeSeats).toBe(8);
    expect(beforeBody.breakdown).toEqual([4, 2]);

    // Another hiker books 3 seats
    const { client: hikerClient } = await createHiker(playwright, baseURL, request);
    const bookRes = await hikerClient.post('/api/bookings', {
      data: { slotId, partySize: 3 },
    });
    expect(bookRes.status()).toBe(201);

    // Re-check: 6 people no longer fit (only 5 free seats left)
    const checkAfter = await request.get(
      `/api/availability?date=${testDate}&time=12:00&partySize=6`,
    );
    expect(checkAfter.status()).toBe(200);
    const afterBody = (await checkAfter.json()) as AvailabilityResponse;
    expect(afterBody.available).toBe(false);
    expect(afterBody.reason).toBe('INSUFFICIENT_SEATS');
    expect(afterBody.totalFreeSeats).toBe(5);

    // But 4 people still fit at Table 2
    const checkFour = await request.get(
      `/api/availability?date=${testDate}&time=12:00&partySize=4`,
    );
    const fourBody = (await checkFour.json()) as AvailabilityResponse;
    expect(fourBody.available).toBe(true);
    expect(fourBody.tables).toEqual([{ tableNumber: 2, seats: 4 }]);

    await hikerClient.dispose();
  });
});

// =============================================================================
// 2. GRAY-BOX E2E API TESTS (Direct Database Seeding & State Inspection)
// =============================================================================

test.describe('MH-04 Gray-Box API: Database State & Constraints', () => {
  // Implemented from former TODO: Imminent slot (< 2h) using db.ts helper
  test('returns unavailable with reason TOO_LATE when requested slot starts in under 2 hours', async ({
    request,
    loggedInRequest,
  }) => {
    // Gray-box: insert slot starting in under 2 hours via psql
    const slotId = trackSlot(createImminentSlot([2, 4]));

    // Read date and time of the imminent slot via slot list
    const listRes = await loggedInRequest.get('/api/slots');
    expect(listRes.status()).toBe(200);
    const slots = (await listRes.json()) as SlotSummary[];
    const imminent = slots.find((s) => s.id === slotId);
    expect(imminent).toBeDefined();

    // Query availability for 2 people
    const checkRes = await request.get(
      `/api/availability?date=${imminent!.date}&time=${imminent!.startTime}&partySize=2`,
    );
    expect(checkRes.status()).toBe(200);

    const body = (await checkRes.json()) as AvailabilityResponse;
    expect(body.available).toBe(false);
    expect(body.reason).toBe('TOO_LATE');
    expect(body.totalFreeSeats).toBe(6);
    // Clarification/Business logic: table allocation is still computed so staff can see it
    expect(body.breakdown).toEqual([2]);
    expect(body.breakdownText).toBe('2 seats');
    expect(body.tables).toBeDefined();
  });

  test('slot in the past returns reason NO_SLOT because past slots cannot be checked', async ({
    request,
  }) => {
    // Gray-box: insert past slot directly into PostgreSQL. Its date is random, so read it back:
    // the query must hit this very slot, otherwise NO_SLOT would only mean "nothing there".
    const slotId = trackSlot(createPastSlot([4, 6]));
    const { date, time } = slotStart(slotId);
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(time).toBe('19:00');

    // Query availability for the date and start time of the past slot
    const checkRes = await request.get(`/api/availability?date=${date}&time=${time}&partySize=2`);
    expect(checkRes.status()).toBe(200);

    const body = (await checkRes.json()) as AvailabilityResponse;
    expect(body.available).toBe(false);
    expect(body.reason).toBe('NO_SLOT');
    expect(body.totalFreeSeats).toBeUndefined();
  });

  test('empty slot (0 tables defined) returns INSUFFICIENT_SEATS and 0 free seats', async ({
    loggedInRequest,
    request,
  }) => {
    // Gray-box: insert a future slot with 0 tables
    const slotId = trackSlot(createSlot([]));

    const listRes = await loggedInRequest.get('/api/slots');
    const slots = (await listRes.json()) as SlotSummary[];
    const emptySlot = slots.find((s) => s.id === slotId);
    expect(emptySlot).toBeDefined();

    const checkRes = await request.get(
      `/api/availability?date=${emptySlot!.date}&time=${emptySlot!.startTime}&partySize=1`,
    );
    expect(checkRes.status()).toBe(200);

    const body = (await checkRes.json()) as AvailabilityResponse;
    expect(body.available).toBe(false);
    expect(body.reason).toBe('INSUFFICIENT_SEATS');
    expect(body.totalFreeSeats).toBe(0);
    expect(body.tables).toBeUndefined();
    expect(body.breakdown).toBeUndefined();
  });

  test('seats occupied by PENDING bookings reduce availability in real-time', async ({
    employeeRequest,
    loggedInRequest,
    request,
  }) => {
    const testDate = uniqueDate();

    // Setup slot with Table 1 (4 seats)
    const slotRes = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '12:00',
        endTime: '13:00',
        tables: [{ tableNumber: 1, seats: 4 }],
      },
    });
    expect(slotRes.status()).toBe(201);
    const { id: slotId } = (await slotRes.json()) as { id: number };
    trackSlot(slotId);

    // Initial availability: 4 seats free
    const checkBefore = await request.get(
      `/api/availability?date=${testDate}&time=12:00&partySize=4`,
    );
    expect(((await checkBefore.json()) as AvailabilityResponse).available).toBe(true);

    // Hiker books 3 seats: the booking is stored in PENDING status awaiting confirmation
    const bookRes = await loggedInRequest.post('/api/bookings', {
      data: { slotId, partySize: 3 },
    });
    expect(bookRes.status()).toBe(201);

    // Gray-box SQL assertion: findFreeSeatsByTable counts PENDING bookings as occupied
    const checkAfter = await request.get(
      `/api/availability?date=${testDate}&time=12:00&partySize=4`,
    );
    const afterBody = (await checkAfter.json()) as AvailabilityResponse;
    expect(afterBody.available).toBe(false);
    expect(afterBody.reason).toBe('INSUFFICIENT_SEATS');
    expect(afterBody.totalFreeSeats).toBe(1);

    // 1 person still fits
    const checkOne = await request.get(`/api/availability?date=${testDate}&time=12:00&partySize=1`);
    expect(((await checkOne.json()) as AvailabilityResponse).available).toBe(true);
  });

  test('contiguous non-overlapping slots on the same day evaluate isolated capacities', async ({
    employeeRequest,
    request,
  }) => {
    const testDate = uniqueDate();

    // Contiguous slot 1: 12:00–13:00 (Table 1: 4 seats)
    const slot1Res = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '12:00',
        endTime: '13:00',
        tables: [{ tableNumber: 1, seats: 4 }],
      },
    });
    expect(slot1Res.status()).toBe(201);
    trackSlot(((await slot1Res.json()) as { id: number }).id);

    // Contiguous slot 2: 13:00–14:00 (Table 1: 8 seats)
    const slot2Res = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '13:00',
        endTime: '14:00',
        tables: [{ tableNumber: 1, seats: 8 }],
      },
    });
    expect(slot2Res.status()).toBe(201);
    trackSlot(((await slot2Res.json()) as { id: number }).id);

    // Availability for 12:00 returns max 4 seats
    const check1 = await request.get(`/api/availability?date=${testDate}&time=12:00&partySize=6`);
    const body1 = (await check1.json()) as AvailabilityResponse;
    expect(body1.available).toBe(false);
    expect(body1.totalFreeSeats).toBe(4);

    // Availability for 13:00 accepts 6 seats
    const check2 = await request.get(`/api/availability?date=${testDate}&time=13:00&partySize=6`);
    const body2 = (await check2.json()) as AvailabilityResponse;
    expect(body2.available).toBe(true);
    expect(body2.totalFreeSeats).toBe(8);
  });
});

// =============================================================================
// 3. WHITE-BOX E2E API TESTS (Internal Code Paths, Branch Coverage & Heuristics)
// =============================================================================

test.describe('MH-04 White-Box API: Internal Algorithms & Branch Coverage', () => {
  test('Branch coverage in formatBreakdown: verifies singular "1 seat" vs plural "seats"', async ({
    employeeRequest,
    request,
  }) => {
    const testDate = uniqueDate();

    // Setup slot with Table 1 (2 seats) and Table 2 (3 seats)
    const slotRes = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '12:00',
        endTime: '13:30',
        tables: [
          { tableNumber: 1, seats: 2 },
          { tableNumber: 2, seats: 3 },
        ],
      },
    });
    expect(slotRes.status()).toBe(201);
    trackSlot(((await slotRes.json()) as { id: number }).id);

    // White-box branch 1: total === 1 -> singular "seat"
    const singularRes = await request.get(
      `/api/availability?date=${testDate}&time=12:00&partySize=1`,
    );
    const singularBody = (await singularRes.json()) as AvailabilityResponse;
    expect(singularBody.breakdownText).toBe('1 seat');

    // White-box branch 2: total > 1 -> plural "seats"
    const pluralRes = await request.get(
      `/api/availability?date=${testDate}&time=12:00&partySize=2`,
    );
    const pluralBody = (await pluralRes.json()) as AvailabilityResponse;
    expect(pluralBody.breakdownText).toBe('2 seats');

    // Multi-table plural
    const multiRes = await request.get(`/api/availability?date=${testDate}&time=12:00&partySize=4`);
    const multiBody = (await multiRes.json()) as AvailabilityResponse;
    expect(multiBody.breakdownText).toBe('3 + 1 seats');
  });

  test('White-box tie-breaker in allocateSeats/smallestFit: selects lowest tableNumber on tie', async ({
    employeeRequest,
    request,
  }) => {
    const testDate = uniqueDate();

    // Slot with Table 1 (4 seats) and Table 2 (4 seats) of identical capacity
    const slotRes = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '12:00',
        endTime: '13:30',
        tables: [
          { tableNumber: 1, seats: 4 },
          { tableNumber: 2, seats: 4 },
        ],
      },
    });
    expect(slotRes.status()).toBe(201);
    trackSlot(((await slotRes.json()) as { id: number }).id);

    // Party of 3 fits at either table: smallestFit tie-breaker must pick Table 1
    const checkRes = await request.get(`/api/availability?date=${testDate}&time=12:00&partySize=3`);
    const body = (await checkRes.json()) as AvailabilityResponse;
    expect(body.available).toBe(true);
    expect(body.tables).toEqual([{ tableNumber: 1, seats: 3 }]);
  });

  test('White-box greedy allocation heuristic: fills largest table first and leaves smallest remainder', async ({
    employeeRequest,
    request,
  }) => {
    const testDate = uniqueDate();

    // Slot with Table 1 (6 seats), Table 2 (5 seats), Table 3 (2 seats)
    const slotRes = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '12:00',
        endTime: '13:30',
        tables: [
          { tableNumber: 1, seats: 6 },
          { tableNumber: 2, seats: 5 },
          { tableNumber: 3, seats: 2 },
        ],
      },
    });
    expect(slotRes.status()).toBe(201);
    trackSlot(((await slotRes.json()) as { id: number }).id);

    // Party of 7: greedy algorithm takes Table 1 (6 seats), remaining 1 person goes to Table 3 (2 seats)
    // Table 2 (5 seats) remains completely free
    const checkRes = await request.get(`/api/availability?date=${testDate}&time=12:00&partySize=7`);
    const body = (await checkRes.json()) as AvailabilityResponse;
    expect(body.available).toBe(true);
    expect(body.breakdown).toEqual([6, 1]);
    expect(body.breakdownText).toBe('6 + 1 seats');
    expect(body.tables).toEqual([
      { tableNumber: 1, seats: 6 },
      { tableNumber: 3, seats: 1 },
    ]);
  });

  test('White-box Zod schema refinement and regex edge cases in checkAvailabilityQuerySchema', async ({
    request,
  }) => {
    const testDate = uniqueDate();

    // 1. Decimal party size: regex /^\d+$/ fails
    expect(
      (await request.get(`/api/availability?date=${testDate}&time=12:00&partySize=3.5`)).status(),
    ).toBe(400);

    // 2. Alphanumeric party size
    expect(
      (
        await request.get(`/api/availability?date=${testDate}&time=12:00&partySize=4people`)
      ).status(),
    ).toBe(400);

    // 3. Leading zeros: regex /^\d+$/ matches and transform(Number) converts to 4 -> succeeds
    const leadingZero = await request.get(
      `/api/availability?date=${testDate}&time=12:00&partySize=04`,
    );
    // Returns 200 (if slot exists) or 200 with NO_SLOT, never 400
    expect(leadingZero.status()).toBe(200);

    // 4. Non-existent calendar date (February 30): isCalendarDate refinement fails
    expect(
      (await request.get(`/api/availability?date=2035-02-30&time=12:00&partySize=2`)).status(),
    ).toBe(400);

    // 5. Hour out of range (24:00)
    expect(
      (await request.get(`/api/availability?date=${testDate}&time=24:00&partySize=2`)).status(),
    ).toBe(400);

    // 6. Minute out of range (12:60)
    expect(
      (await request.get(`/api/availability?date=${testDate}&time=12:60&partySize=2`)).status(),
    ).toBe(400);
  });
});
