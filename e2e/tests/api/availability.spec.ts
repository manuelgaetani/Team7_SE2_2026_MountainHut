import { randomInt } from 'node:crypto';
import { expect, test } from '../../fixtures/auth.js';

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
  reason?: string;
}

// Generates an isolated calendar date so parallel tests never collide.
function uniqueDate(): string {
  const dayOffset = randomInt(5000, 25000);
  const d = new Date(Date.UTC(2035, 0, 1) + dayOffset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// TODO(MH-04): Black-box tests pending implementation of MH-04 availability endpoint
test.describe.skip('MH-04 Black-Box API: Check availability', () => {
  test('R1 & R4: Public check without login returns availability and table breakdown for single table', async ({
    employeeRequest,
    request,
  }) => {
    const testDate = uniqueDate();

    // 1. Staff creates a slot with tables via public REST API
    const slotRes = await employeeRequest.post('/api/slots', {
      data: {
        date: testDate,
        startTime: '12:00',
        endTime: '13:30',
        tables: [{ tableNumber: 1, seats: 4 }],
      },
    });
    expect(slotRes.status()).toBe(201);

    // 2. Public anonymous client (no auth cookies) checks availability for 3 people
    const checkRes = await request.get(`/api/availability?date=${testDate}&time=12:00&partySize=3`);
    expect(checkRes.status()).toBe(200);

    const body = (await checkRes.json()) as AvailabilityResponse;
    expect(body.available).toBe(true);
    expect(body.date).toBe(testDate);
    expect(body.time).toBe('12:00');
    expect(body.partySize).toBe(3);
    // Table 1 can hold 3 seats
    expect(body.tables).toBeDefined();
    expect(body.tables).toContainEqual(
      expect.objectContaining({ tableNumber: 1, seats: expect.any(Number) }),
    );
  });

  test('R4: Multi-table layout breakdown is provided when party spans multiple tables', async ({
    employeeRequest,
    request,
  }) => {
    const testDate = uniqueDate();

    // Setup slot with 3 tables of 2 seats each (total 6 seats)
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

    // Public client checks availability for a party of 6
    const checkRes = await request.get(`/api/availability?date=${testDate}&time=13:00&partySize=6`);
    expect(checkRes.status()).toBe(200);

    const body = (await checkRes.json()) as AvailabilityResponse;
    expect(body.available).toBe(true);
    expect(body.partySize).toBe(6);

    // Breakdown must indicate distribution across the 3 tables of 2
    if (body.breakdown) {
      expect(body.breakdown).toEqual([2, 2, 2]);
    } else if (body.breakdownText) {
      expect(body.breakdownText).toContain('2 + 2 + 2');
    } else {
      expect(body.tables).toHaveLength(3);
      const totalAllocated = body.tables!.reduce((sum, t) => sum + t.seats, 0);
      expect(totalAllocated).toBe(6);
    }
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

    // Request 5 seats when only 4 exist
    const checkRes = await request.get(`/api/availability?date=${testDate}&time=19:00&partySize=5`);
    expect(checkRes.status()).toBe(200);

    const body = (await checkRes.json()) as AvailabilityResponse;
    expect(body.available).toBe(false);
    expect(body.partySize).toBe(5);
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
    // Clarification requirement: no alternative slots are suggested
    expect(body.alternativeSlots).toBeUndefined();
    expect(body.suggestions).toBeUndefined();
  });

  test('R2: Rejects invalid query parameters with 400 Bad Request', async ({ request }) => {
    const testDate = uniqueDate();

    // 1. Party size 0 or negative
    const zeroParty = await request.get(
      `/api/availability?date=${testDate}&time=12:00&partySize=0`,
    );
    expect(zeroParty.status()).toBe(400);

    const negParty = await request.get(
      `/api/availability?date=${testDate}&time=12:00&partySize=-2`,
    );
    expect(negParty.status()).toBe(400);

    // 2. Invalid date format
    const badDate = await request.get(`/api/availability?date=not-a-date&time=12:00&partySize=2`);
    expect(badDate.status()).toBe(400);

    // 3. Invalid time format
    const badTime = await request.get(`/api/availability?date=${testDate}&time=25:99&partySize=2`);
    expect(badTime.status()).toBe(400);
  });
});

test.describe('MH-04 Black-Box API: Planned Future Scenarios (TODOs)', () => {
  // TODO(MH-04): Test availability check on slot starting in less than 2 hours (too late rule)
  test.skip('returns unavailable when requested slot starts in under 2 hours', async () => {});

  // TODO(MH-04): Test availability immediately reflects capacity reduction when a booking is created
  test.skip('updates available table breakdown dynamically after another hiker books seats', async () => {});

  // TODO(MH-04): Test availability check for upper boundary party size equal to max database integer
  test.skip('handles maximum integer boundary for party size gracefully without server error', async () => {});

  // TODO(MH-04): Test that availability endpoint headers do not set any authentication session cookies
  test.skip('verifies public availability response sets no session or tracking cookies', async () => {});
});
