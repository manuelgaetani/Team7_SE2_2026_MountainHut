import { randomInt } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import { deleteSlot } from '../../fixtures/db.js';

interface SlotTable {
  tableNumber: number;
  seats: number;
}

interface SlotDetails {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  tables: SlotTable[];
  totalSeats: number;
}

interface RepeatWeeklyScheduleResponse {
  createdSlotsCount: number;
  skippedSlotsCount: number;
  targetWeeks: number;
  createdSlots: SlotDetails[];
}

let slotIds: number[] = [];

test.afterEach(() => {
  slotIds.forEach(deleteSlot);
  slotIds = [];
});

// Generates a random future date on an isolated Monday to avoid collision across parallel runs
function uniqueMondayDate(): string {
  const dayOffset = randomInt(5000, 25000);
  const d = new Date(Date.UTC(2035, 0, 1) + dayOffset * 86_400_000);
  // Adjust to nearest Monday (1 = Monday, 0 = Sunday)
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? 1 : (8 - day) % 7;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function createSlotWithTables(
  request: APIRequestContext,
  date: string,
  startTime: string,
  endTime: string,
  tables: SlotTable[],
): Promise<SlotDetails> {
  const res = await request.post('/api/slots', {
    data: { date, startTime, endTime, tables },
  });
  expect(res.status()).toBe(201);
  const slot = (await res.json()) as SlotDetails;
  slotIds.push(slot.id);
  return slot;
}

test.describe('MH-09 Black-Box API: Repeat a weekly schedule', () => {
  test.describe('R1: Role-Based Access Control (RBAC)', () => {
    test('refuses unauthenticated requests with 401 Unauthorized', async ({ request }) => {
      const sourceDate = uniqueMondayDate();
      const res = await request.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: sourceDate, repeatWeeks: 2 },
      });
      expect(res.status()).toBe(401);
    });

    test('forbids hikers (standard users) with 403 Forbidden', async ({ loggedInRequest }) => {
      const sourceDate = uniqueMondayDate();
      const res = await loggedInRequest.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: sourceDate, repeatWeeks: 2 },
      });
      expect(res.status()).toBe(403);
    });

    test('allows employee to repeat a weekly schedule', async ({ employeeRequest }) => {
      const sourceDate = uniqueMondayDate();
      await createSlotWithTables(employeeRequest, sourceDate, '12:00', '14:00', [
        { tableNumber: 1, seats: 4 },
      ]);

      const res = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: sourceDate, repeatWeeks: 1 },
      });
      expect(res.status()).toBe(201);

      const body = (await res.json()) as RepeatWeeklyScheduleResponse;
      body.createdSlots?.forEach((s) => slotIds.push(s.id));
      expect(body.createdSlotsCount).toBe(1);
    });

    test('allows warden to repeat a weekly schedule as staff', async ({ wardenRequest }) => {
      const sourceDate = uniqueMondayDate();
      await createSlotWithTables(wardenRequest, sourceDate, '12:00', '14:00', [
        { tableNumber: 1, seats: 4 },
      ]);

      const res = await wardenRequest.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: sourceDate, repeatWeeks: 1 },
      });
      expect(res.status()).toBe(201);

      const body = (await res.json()) as RepeatWeeklyScheduleResponse;
      body.createdSlots?.forEach((s) => slotIds.push(s.id));
      expect(body.createdSlotsCount).toBe(1);
    });
  });

  test.describe('R2, R3, R4 & R6: Schedule Replication Across Multiple Weeks', () => {
    test('replicates multi-slot and multi-day schedule across 2 future weeks with exact tables and capacities', async ({
      employeeRequest,
    }) => {
      const monday = uniqueMondayDate();
      const wednesday = addDays(monday, 2);
      const saturday = addDays(monday, 5);

      // 1. Configure distinct slots across source week
      // Monday lunch: 12:00-14:00 with Table 1 (4) and Table 2 (6) -> 10 seats
      await createSlotWithTables(employeeRequest, monday, '12:00', '14:00', [
        { tableNumber: 1, seats: 4 },
        { tableNumber: 2, seats: 6 },
      ]);

      // Wednesday dinner: 19:00-21:30 with Table 1 (2), Table 2 (4), Table 3 (8) -> 14 seats
      await createSlotWithTables(employeeRequest, wednesday, '19:00', '21:30', [
        { tableNumber: 1, seats: 2 },
        { tableNumber: 2, seats: 4 },
        { tableNumber: 3, seats: 8 },
      ]);

      // Saturday lunch: 11:30-13:30 with Table 1 (6) -> 6 seats
      await createSlotWithTables(employeeRequest, saturday, '11:30', '13:30', [
        { tableNumber: 1, seats: 6 },
      ]);

      // 2. Repeat source week across 2 consecutive weeks
      const repeatRes = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: {
          sourceStartDate: monday,
          repeatWeeks: 2,
        },
      });
      expect(repeatRes.status()).toBe(201);

      const result = (await repeatRes.json()) as RepeatWeeklyScheduleResponse;
      expect(result.createdSlotsCount).toBe(6); // 3 slots x 2 weeks
      expect(result.skippedSlotsCount).toBe(0);
      expect(result.targetWeeks).toBe(2);

      result.createdSlots?.forEach((s) => slotIds.push(s.id));

      // 3. Verify Week 1 target slots via GET /api/slots/schedule
      const w1Monday = addDays(monday, 7);
      const w1Wednesday = addDays(wednesday, 7);
      const w1Saturday = addDays(saturday, 7);

      const mondayW1Res = await employeeRequest.get(`/api/slots/schedule?date=${w1Monday}`);
      expect(mondayW1Res.status()).toBe(200);
      const mondayW1Slots = (await mondayW1Res.json()) as SlotDetails[];
      expect(mondayW1Slots).toHaveLength(1);
      expect(mondayW1Slots[0]).toMatchObject({
        date: w1Monday,
        startTime: '12:00',
        endTime: '14:00',
        totalSeats: 10,
        tables: [
          { tableNumber: 1, seats: 4 },
          { tableNumber: 2, seats: 6 },
        ],
      });

      const wednesdayW1Res = await employeeRequest.get(`/api/slots/schedule?date=${w1Wednesday}`);
      expect(wednesdayW1Res.status()).toBe(200);
      const wednesdayW1Slots = (await wednesdayW1Res.json()) as SlotDetails[];
      expect(wednesdayW1Slots).toHaveLength(1);
      expect(wednesdayW1Slots[0]).toMatchObject({
        date: w1Wednesday,
        startTime: '19:00',
        endTime: '21:30',
        totalSeats: 14,
        tables: [
          { tableNumber: 1, seats: 2 },
          { tableNumber: 2, seats: 4 },
          { tableNumber: 3, seats: 8 },
        ],
      });

      const saturdayW1Res = await employeeRequest.get(`/api/slots/schedule?date=${w1Saturday}`);
      expect(saturdayW1Res.status()).toBe(200);
      const saturdayW1Slots = (await saturdayW1Res.json()) as SlotDetails[];
      expect(saturdayW1Slots).toHaveLength(1);
      expect(saturdayW1Slots[0]).toMatchObject({
        date: w1Saturday,
        startTime: '11:30',
        endTime: '13:30',
        totalSeats: 6,
        tables: [{ tableNumber: 1, seats: 6 }],
      });

      // 4. Verify Week 2 target slots
      const w2Monday = addDays(monday, 14);
      const mondayW2Res = await employeeRequest.get(`/api/slots/schedule?date=${w2Monday}`);
      expect(mondayW2Res.status()).toBe(200);
      const mondayW2Slots = (await mondayW2Res.json()) as SlotDetails[];
      expect(mondayW2Slots).toHaveLength(1);
      expect(mondayW2Slots[0]).toMatchObject({
        date: w2Monday,
        startTime: '12:00',
        endTime: '14:00',
        totalSeats: 10,
      });
    });

    test('replicates empty slots (0 tables) correctly without failing', async ({
      employeeRequest,
    }) => {
      const monday = uniqueMondayDate();
      // Slot without tables
      const res = await employeeRequest.post('/api/slots', {
        data: { date: monday, startTime: '15:00', endTime: '17:00' },
      });
      expect(res.status()).toBe(201);
      const sourceSlot = (await res.json()) as SlotDetails;
      slotIds.push(sourceSlot.id);

      const repeatRes = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: monday, repeatWeeks: 1 },
      });
      expect(repeatRes.status()).toBe(201);

      const body = (await repeatRes.json()) as RepeatWeeklyScheduleResponse;
      body.createdSlots?.forEach((s) => slotIds.push(s.id));
      expect(body.createdSlotsCount).toBe(1);

      const targetDate = addDays(monday, 7);
      const targetRes = await employeeRequest.get(`/api/slots/schedule?date=${targetDate}`);
      const targetSlots = (await targetRes.json()) as SlotDetails[];
      expect(targetSlots[0]).toMatchObject({
        date: targetDate,
        startTime: '15:00',
        endTime: '17:00',
        totalSeats: 0,
        tables: [],
      });
    });

    test('replicated slots are bookable by hikers independently of source slots', async ({
      employeeRequest,
      loggedInRequest,
    }) => {
      const monday = uniqueMondayDate();
      await createSlotWithTables(employeeRequest, monday, '12:00', '13:30', [
        { tableNumber: 1, seats: 4 },
      ]);

      const repeatRes = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: monday, repeatWeeks: 1 },
      });
      expect(repeatRes.status()).toBe(201);
      const body = (await repeatRes.json()) as RepeatWeeklyScheduleResponse;
      const targetSlot = body.createdSlots[0];
      slotIds.push(targetSlot.id);

      // Book the replicated slot as hiker
      const bookingRes = await loggedInRequest.post('/api/bookings', {
        data: {
          slotId: targetSlot.id,
          partySize: 4,
        },
      });
      expect(bookingRes.status()).toBe(201);

      // Source slot remains completely free (4 free seats)
      const sourceSchedule = await employeeRequest.get(`/api/slots/schedule?date=${monday}`);
      const sourceSlots = (await sourceSchedule.json()) as SlotDetails[];
      expect(sourceSlots[0].totalSeats).toBe(4);
    });
  });

  test.describe('R5: Conflict Handling & Idempotency', () => {
    test('skips conflicting slots and creates remaining non-conflicting slots when conflictStrategy is SKIP', async ({
      employeeRequest,
    }) => {
      const monday = uniqueMondayDate();
      const targetMonday = addDays(monday, 7);

      // 1. Create two slots on source Monday
      await createSlotWithTables(employeeRequest, monday, '12:00', '13:30', [
        { tableNumber: 1, seats: 4 },
      ]);
      await createSlotWithTables(employeeRequest, monday, '19:00', '20:30', [
        { tableNumber: 1, seats: 6 },
      ]);

      // 2. Pre-create one overlapping slot on target Monday (12:00-13:30)
      await createSlotWithTables(employeeRequest, targetMonday, '12:00', '13:30', [
        { tableNumber: 1, seats: 2 },
      ]);

      // 3. Repeat with SKIP strategy
      const res = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: {
          sourceStartDate: monday,
          repeatWeeks: 1,
          conflictStrategy: 'SKIP',
        },
      });
      expect(res.status()).toBe(201);

      const body = (await res.json()) as RepeatWeeklyScheduleResponse;
      body.createdSlots?.forEach((s) => slotIds.push(s.id));
      expect(body.createdSlotsCount).toBe(1); // Only 19:00 slot created
      expect(body.skippedSlotsCount).toBe(1); // 12:00 slot skipped

      // Verify target Monday now has both slots
      const targetSchedule = await employeeRequest.get(`/api/slots/schedule?date=${targetMonday}`);
      const slots = (await targetSchedule.json()) as SlotDetails[];
      expect(slots).toHaveLength(2);
    });

    test('rejects repetition with 409 Conflict when target slot exists and conflictStrategy is FAIL', async ({
      employeeRequest,
    }) => {
      const monday = uniqueMondayDate();
      const targetMonday = addDays(monday, 7);

      await createSlotWithTables(employeeRequest, monday, '12:00', '13:30', [
        { tableNumber: 1, seats: 4 },
      ]);
      await createSlotWithTables(employeeRequest, targetMonday, '12:00', '13:30', [
        { tableNumber: 1, seats: 4 },
      ]);

      const res = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: {
          sourceStartDate: monday,
          repeatWeeks: 1,
          conflictStrategy: 'FAIL',
        },
      });
      expect(res.status()).toBe(409);
    });
  });

  test.describe('R6 & R7: Input Validation & Error Handling', () => {
    test('returns 422 Unprocessable Entity when source week contains no slots to copy', async ({
      employeeRequest,
    }) => {
      const emptyMonday = uniqueMondayDate();
      const res = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: emptyMonday, repeatWeeks: 2 },
      });
      expect(res.status()).toBe(422);
    });

    test('rejects repeatWeeks of 0 with 400 Bad Request', async ({ employeeRequest }) => {
      const monday = uniqueMondayDate();
      const res = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: monday, repeatWeeks: 0 },
      });
      expect(res.status()).toBe(400);
    });

    test('rejects negative repeatWeeks with 400 Bad Request', async ({ employeeRequest }) => {
      const monday = uniqueMondayDate();
      const res = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: monday, repeatWeeks: -3 },
      });
      expect(res.status()).toBe(400);
    });

    test('rejects float repeatWeeks with 400 Bad Request', async ({ employeeRequest }) => {
      const monday = uniqueMondayDate();
      const res = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: monday, repeatWeeks: 2.5 },
      });
      expect(res.status()).toBe(400);
    });

    test('rejects repeatWeeks exceeding maximum limit (52) with 400 Bad Request', async ({
      employeeRequest,
    }) => {
      const monday = uniqueMondayDate();
      const res = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: monday, repeatWeeks: 53 },
      });
      expect(res.status()).toBe(400);
    });

    test('rejects malformed sourceStartDate with 400 Bad Request', async ({ employeeRequest }) => {
      const res = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: 'not-a-date', repeatWeeks: 2 },
      });
      expect(res.status()).toBe(400);
    });

    test('rejects non-existent calendar date (2035-02-31) with 400 Bad Request', async ({
      employeeRequest,
    }) => {
      const res = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: '2035-02-31', repeatWeeks: 2 },
      });
      expect(res.status()).toBe(400);
    });

    test('rejects missing sourceStartDate with 400 Bad Request', async ({ employeeRequest }) => {
      const res = await employeeRequest.post('/api/slots/repeat-weekly', {
        data: { repeatWeeks: 2 },
      });
      expect(res.status()).toBe(400);
    });
  });

  test.describe('MH-09 Planned Future Scenarios (TODOs)', () => {
    // TODO(MH-09): Repeat schedule across daylight saving time transition (CET to CEST)
    test.skip('correctly handles clock shift across European daylight saving time boundaries', async () => {});

    // TODO(MH-09): Selective day-of-week repetition (e.g. repeat only weekend schedules)
    test.skip('allows repeating only specific days of the week (e.g. only Friday to Sunday)', async () => {});

    // TODO(MH-09): Atomic rollback when database error occurs during multi-week repetition
    test.skip('rolls back all created slots atomically if any target insertion fails mid-batch', async () => {});

    // TODO(MH-09): Seasonal exclusion dates / holiday blackout filtering
    test.skip('skips slot repetition on explicitly designated hut closure or maintenance dates', async () => {});

    // TODO(MH-09): Undo/rollback endpoint for a repeated schedule batch
    test.skip('provides an undo endpoint allowing staff to delete an entire repeated schedule batch', async () => {});
  });
});

