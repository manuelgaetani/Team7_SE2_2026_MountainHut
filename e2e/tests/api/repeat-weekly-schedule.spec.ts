import { randomInt } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import { bookingStatus, deleteSlot, setBookingStatus } from '../../fixtures/db.js';

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
  targetWeeks: number;
  createdSlotsCount: number;
  replacedSlotsCount: number;
  createdSlots: SlotDetails[];
}

interface BookableSlot {
  id: number;
  freeSeats: number;
}

let slotIds: number[] = [];

test.afterEach(() => {
  slotIds.forEach(deleteSlot);
  slotIds = [];
});

// A repeat replaces whole target weeks, so these tests use their own range of years (2200-2580),
// far from the dates of the other suites. Random weeks keep parallel tests apart.
function uniqueMondayDate(): string {
  // 2200-01-06 is a Monday.
  const monday = Date.UTC(2200, 0, 6) + randomInt(0, 20_000) * 7 * 86_400_000;
  return new Date(monday).toISOString().slice(0, 10);
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

type RepeatBody = RepeatWeeklyScheduleResponse & { message?: string };

async function repeat(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<{ status: number; body: RepeatBody }> {
  const res = await request.post('/api/slots/repeat-weekly', { data });
  const body = (await res.json()) as RepeatBody;
  body.createdSlots?.forEach((s) => slotIds.push(s.id));
  return { status: res.status(), body };
}

async function scheduleOf(request: APIRequestContext, date: string): Promise<SlotDetails[]> {
  const res = await request.get(`/api/slots/schedule?date=${date}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as SlotDetails[];
}

async function book(
  request: APIRequestContext,
  slotId: number,
  partySize: number,
): Promise<number> {
  const res = await request.post('/api/bookings', { data: { slotId, partySize } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: number }).id;
}

const oneTable = (seats: number): SlotTable[] => [{ tableNumber: 1, seats }];

test.describe('MH-09 Black-Box API: Repeat a weekly schedule', () => {
  test.describe('R1: Role-Based Access Control (RBAC)', () => {
    test('refuses unauthenticated requests with 401 Unauthorized', async ({ request }) => {
      const res = await request.post('/api/slots/repeat-weekly', {
        data: { sourceStartDate: uniqueMondayDate(), repeatWeeks: 2 },
      });
      expect(res.status()).toBe(401);
    });

    test('forbids hikers with 403 Forbidden and copies nothing', async ({
      loggedInRequest,
      employeeRequest,
    }) => {
      const monday = uniqueMondayDate();
      await createSlotWithTables(employeeRequest, monday, '12:00', '14:00', oneTable(4));

      const { status } = await repeat(loggedInRequest, { sourceStartDate: monday, repeatWeeks: 1 });
      expect(status).toBe(403);
      expect(await scheduleOf(employeeRequest, addDays(monday, 7))).toEqual([]);
    });

    for (const role of ['employee', 'warden'] as const) {
      test(`allows a ${role} to repeat a weekly schedule`, async ({
        employeeRequest,
        wardenRequest,
      }) => {
        const staff = role === 'employee' ? employeeRequest : wardenRequest;
        const monday = uniqueMondayDate();
        await createSlotWithTables(staff, monday, '12:00', '14:00', oneTable(4));

        const { status, body } = await repeat(staff, { sourceStartDate: monday, repeatWeeks: 1 });
        expect(status).toBe(201);
        expect(body).toMatchObject({ targetWeeks: 1, createdSlotsCount: 1, replacedSlotsCount: 0 });
      });
    }
  });

  test.describe('R2, R3 & R4: Schedule Replication Across Multiple Weeks', () => {
    test('replicates a multi-day schedule across 2 weeks with exact tables and capacities', async ({
      employeeRequest,
    }) => {
      const monday = uniqueMondayDate();
      const wednesday = addDays(monday, 2);
      const saturday = addDays(monday, 5);
      const mondayTables = [
        { tableNumber: 1, seats: 4 },
        { tableNumber: 2, seats: 6 },
      ];
      const wednesdayTables = [
        { tableNumber: 1, seats: 2 },
        { tableNumber: 2, seats: 4 },
        { tableNumber: 3, seats: 8 },
      ];

      await createSlotWithTables(employeeRequest, monday, '12:00', '14:00', mondayTables);
      await createSlotWithTables(employeeRequest, wednesday, '19:00', '21:30', wednesdayTables);
      await createSlotWithTables(employeeRequest, saturday, '11:30', '13:30', oneTable(6));

      const { status, body } = await repeat(employeeRequest, {
        sourceStartDate: monday,
        repeatWeeks: 2,
      });
      expect(status).toBe(201);
      expect(body).toMatchObject({ targetWeeks: 2, createdSlotsCount: 6, replacedSlotsCount: 0 });

      // The response lists the copies ordered by date and start time.
      expect(body.createdSlots.map((s) => `${s.date} ${s.startTime}`)).toEqual([
        `${addDays(monday, 7)} 12:00`,
        `${addDays(wednesday, 7)} 19:00`,
        `${addDays(saturday, 7)} 11:30`,
        `${addDays(monday, 14)} 12:00`,
        `${addDays(wednesday, 14)} 19:00`,
        `${addDays(saturday, 14)} 11:30`,
      ]);

      for (const week of [1, 2]) {
        expect(await scheduleOf(employeeRequest, addDays(monday, 7 * week))).toMatchObject([
          { startTime: '12:00', endTime: '14:00', totalSeats: 10, tables: mondayTables },
        ]);
        expect(await scheduleOf(employeeRequest, addDays(wednesday, 7 * week))).toMatchObject([
          { startTime: '19:00', endTime: '21:30', totalSeats: 14, tables: wednesdayTables },
        ]);
        expect(await scheduleOf(employeeRequest, addDays(saturday, 7 * week))).toMatchObject([
          { startTime: '11:30', endTime: '13:30', totalSeats: 6, tables: oneTable(6) },
        ]);
      }
      // Nothing beyond the requested weeks.
      expect(await scheduleOf(employeeRequest, addDays(monday, 21))).toEqual([]);
    });

    test('the source period is the 7 days from sourceStartDate, whatever the weekday', async ({
      employeeRequest,
    }) => {
      const thursday = addDays(uniqueMondayDate(), 3);
      const before = addDays(thursday, -1);
      const lastSourceDay = addDays(thursday, 6);

      await createSlotWithTables(employeeRequest, before, '12:00', '13:00', oneTable(2));
      await createSlotWithTables(employeeRequest, thursday, '12:00', '13:00', oneTable(4));
      await createSlotWithTables(employeeRequest, lastSourceDay, '19:00', '20:00', oneTable(6));

      const { status, body } = await repeat(employeeRequest, {
        sourceStartDate: thursday,
        repeatWeeks: 1,
      });
      expect(status).toBe(201);
      expect(body.createdSlots.map((s) => s.date)).toEqual([
        addDays(thursday, 7),
        addDays(lastSourceDay, 7),
      ]);
      // The day before the source period is not copied (its copy would land on lastSourceDay)
      // and is left untouched.
      expect(await scheduleOf(employeeRequest, lastSourceDay)).toMatchObject([
        { startTime: '19:00' },
      ]);
      expect(await scheduleOf(employeeRequest, before)).toHaveLength(1);
    });

    test('replicates slots without tables (0 seats)', async ({ employeeRequest }) => {
      const monday = uniqueMondayDate();
      const res = await employeeRequest.post('/api/slots', {
        data: { date: monday, startTime: '15:00', endTime: '17:00' },
      });
      expect(res.status()).toBe(201);
      slotIds.push(((await res.json()) as SlotDetails).id);

      const { status, body } = await repeat(employeeRequest, {
        sourceStartDate: monday,
        repeatWeeks: 1,
      });
      expect(status).toBe(201);
      expect(body.createdSlotsCount).toBe(1);
      expect(await scheduleOf(employeeRequest, addDays(monday, 7))).toMatchObject([
        { startTime: '15:00', endTime: '17:00', totalSeats: 0, tables: [] },
      ]);
    });

    test('accepts the maximum of 12 weeks and copies into each of them', async ({
      employeeRequest,
    }) => {
      const monday = uniqueMondayDate();
      await createSlotWithTables(employeeRequest, monday, '12:00', '13:00', oneTable(4));

      const { status, body } = await repeat(employeeRequest, {
        sourceStartDate: monday,
        repeatWeeks: 12,
      });
      expect(status).toBe(201);
      expect(body.createdSlotsCount).toBe(12);
      expect(body.createdSlots.map((s) => s.date)).toEqual(
        Array.from({ length: 12 }, (_, i) => addDays(monday, 7 * (i + 1))),
      );
    });

    // Europe/Rome moves to summer time on the last Sunday of March.
    test('keeps dates and times across a daylight saving time change', async ({
      employeeRequest,
    }) => {
      // A random year in the isolated range; the source week ends on the day of the change.
      const year = 2200 + randomInt(0, 380);
      const march31 = new Date(Date.UTC(year, 2, 31));
      const lastSunday = addDays(march31.toISOString().slice(0, 10), -march31.getUTCDay());
      const monday = addDays(lastSunday, -6);
      const saturday = addDays(monday, 5);
      await createSlotWithTables(employeeRequest, saturday, '19:00', '21:00', oneTable(4));

      const { status, body } = await repeat(employeeRequest, {
        sourceStartDate: monday,
        repeatWeeks: 1,
      });
      expect(status).toBe(201);
      expect(body.createdSlots).toMatchObject([
        { date: addDays(saturday, 7), startTime: '19:00', endTime: '21:00' },
      ]);
    });

    test('copies are independent: booking a copy leaves the source slot free', async ({
      employeeRequest,
      loggedInRequest,
    }) => {
      const monday = uniqueMondayDate();
      const source = await createSlotWithTables(
        employeeRequest,
        monday,
        '12:00',
        '13:30',
        oneTable(4),
      );

      const { body } = await repeat(employeeRequest, { sourceStartDate: monday, repeatWeeks: 1 });
      const copy = body.createdSlots[0]!;
      expect(copy.id).not.toBe(source.id);
      await book(loggedInRequest, copy.id, 4);

      const listed = (await (await loggedInRequest.get('/api/slots')).json()) as BookableSlot[];
      expect(listed.find((s) => s.id === source.id)?.freeSeats).toBe(4);
      expect(listed.find((s) => s.id === copy.id)?.freeSeats).toBe(0);
    });
  });

  test.describe('R10: A target week without reservations is replaced completely', () => {
    test('deletes the slots already in the target week and creates the copies', async ({
      employeeRequest,
    }) => {
      const monday = uniqueMondayDate();
      const targetMonday = addDays(monday, 7);
      const targetThursday = addDays(targetMonday, 3);
      await createSlotWithTables(employeeRequest, monday, '12:00', '13:30', oneTable(4));
      // Same times with other tables, and a slot the source does not have.
      await createSlotWithTables(employeeRequest, targetMonday, '12:00', '13:30', oneTable(2));
      await createSlotWithTables(employeeRequest, targetThursday, '15:00', '16:00', oneTable(8));

      const { status, body } = await repeat(employeeRequest, {
        sourceStartDate: monday,
        repeatWeeks: 1,
      });
      expect(status).toBe(201);
      expect(body).toMatchObject({ createdSlotsCount: 1, replacedSlotsCount: 2 });

      expect(await scheduleOf(employeeRequest, targetMonday)).toMatchObject([
        { id: body.createdSlots[0]!.id, totalSeats: 4, tables: oneTable(4) },
      ]);
      expect(await scheduleOf(employeeRequest, targetThursday)).toEqual([]);
    });

    test('ignores a conflictStrategy sent by the client (course issue #45)', async ({
      employeeRequest,
    }) => {
      const monday = uniqueMondayDate();
      await createSlotWithTables(employeeRequest, monday, '12:00', '13:30', oneTable(4));
      await createSlotWithTables(
        employeeRequest,
        addDays(monday, 7),
        '12:00',
        '13:30',
        oneTable(4),
      );

      const { status, body } = await repeat(employeeRequest, {
        sourceStartDate: monday,
        repeatWeeks: 1,
        conflictStrategy: 'FAIL',
      });
      expect(status).toBe(201);
      expect(body).toMatchObject({ createdSlotsCount: 1, replacedSlotsCount: 1 });
    });

    test('a rejected booking does not block the copy and is deleted with its slot', async ({
      employeeRequest,
      loggedInRequest,
    }) => {
      const monday = uniqueMondayDate();
      await createSlotWithTables(employeeRequest, monday, '12:00', '13:30', oneTable(4));
      const target = await createSlotWithTables(
        employeeRequest,
        addDays(monday, 7),
        '12:00',
        '13:30',
        oneTable(4),
      );
      const bookingId = await book(loggedInRequest, target.id, 2);
      setBookingStatus(bookingId, 'REJECTED');

      const { status, body } = await repeat(employeeRequest, {
        sourceStartDate: monday,
        repeatWeeks: 1,
      });
      expect(status).toBe(201);
      expect(body.replacedSlotsCount).toBe(1);
      // The booking no longer exists.
      expect(bookingStatus(bookingId)).toBe('');
    });
  });

  test.describe('R5: A target week with reservations cannot be replaced', () => {
    for (const reservation of ['PENDING', 'CONFIRMED'] as const) {
      test(`answers 409 for a ${reservation} booking and writes nothing`, async ({
        employeeRequest,
        loggedInRequest,
      }) => {
        const monday = uniqueMondayDate();
        const targetMonday = addDays(monday, 7);
        await createSlotWithTables(employeeRequest, monday, '12:00', '13:30', oneTable(4));
        await createSlotWithTables(
          employeeRequest,
          addDays(monday, 2),
          '19:00',
          '20:30',
          oneTable(6),
        );
        const target = await createSlotWithTables(
          employeeRequest,
          targetMonday,
          '12:00',
          '13:30',
          oneTable(2),
        );
        const bookingId = await book(loggedInRequest, target.id, 2);
        setBookingStatus(bookingId, reservation);

        const { status, body } = await repeat(employeeRequest, {
          sourceStartDate: monday,
          repeatWeeks: 1,
        });
        expect(status).toBe(409);
        expect(body.message).toBe(
          `The week starting ${targetMonday} has reservations: its schedule cannot be replaced`,
        );

        // The reserved week is untouched: same slot, same booking, no copies.
        expect(await scheduleOf(employeeRequest, targetMonday)).toMatchObject([
          { id: target.id, tables: oneTable(2) },
        ]);
        expect(await scheduleOf(employeeRequest, addDays(monday, 9))).toEqual([]);
        expect(bookingStatus(bookingId)).toBe(reservation);
      });
    }

    test('all or nothing: a reservation in week 2 leaves week 1 unchanged too', async ({
      employeeRequest,
      loggedInRequest,
    }) => {
      const monday = uniqueMondayDate();
      await createSlotWithTables(employeeRequest, monday, '12:00', '13:30', oneTable(4));
      const week1 = await createSlotWithTables(
        employeeRequest,
        addDays(monday, 8),
        '15:00',
        '16:00',
        oneTable(4),
      );
      const week2 = await createSlotWithTables(
        employeeRequest,
        addDays(monday, 18),
        '12:00',
        '13:30',
        oneTable(4),
      );
      await book(loggedInRequest, week2.id, 2);

      const { status, body } = await repeat(employeeRequest, {
        sourceStartDate: monday,
        repeatWeeks: 2,
      });
      expect(status).toBe(409);
      expect(body.message).toBe(
        `The week starting ${addDays(monday, 14)} has reservations: its schedule cannot be replaced`,
      );
      expect(await scheduleOf(employeeRequest, addDays(monday, 7))).toEqual([]);
      expect(await scheduleOf(employeeRequest, addDays(monday, 8))).toMatchObject([
        { id: week1.id },
      ]);
    });
  });

  test.describe('R6 & R7: Input Validation & Error Handling', () => {
    test('returns 422 when the source week contains no slots to copy', async ({
      employeeRequest,
    }) => {
      const { status, body } = await repeat(employeeRequest, {
        sourceStartDate: uniqueMondayDate(),
        repeatWeeks: 2,
      });
      expect(status).toBe(422);
      expect(body.message).toBe('Source week contains no time slots to repeat');
    });

    const invalidBodies: [string, Record<string, unknown>][] = [
      ['repeatWeeks 0', { repeatWeeks: 0 }],
      ['negative repeatWeeks', { repeatWeeks: -3 }],
      ['decimal repeatWeeks', { repeatWeeks: 2.5 }],
      ['repeatWeeks 13, above the maximum', { repeatWeeks: 13 }],
      ['repeatWeeks as a string', { repeatWeeks: '2' }],
      ['missing repeatWeeks', { repeatWeeks: undefined }],
      ['malformed sourceStartDate', { sourceStartDate: 'not-a-date' }],
      ['non-existent calendar date', { sourceStartDate: '2035-02-31' }],
      ['missing sourceStartDate', { sourceStartDate: undefined }],
    ];
    for (const [name, change] of invalidBodies) {
      test(`rejects ${name} with 400 Bad Request`, async ({ employeeRequest }) => {
        const data = { sourceStartDate: uniqueMondayDate(), repeatWeeks: 2, ...change };
        const { status } = await repeat(employeeRequest, data);
        expect(status).toBe(400);
      });
    }
  });

  test.describe('Behaviour around the planned scenarios', () => {
    test('copies every day of the source week onto the same weekday, none left out', async ({
      employeeRequest,
    }) => {
      const monday = uniqueMondayDate();
      const days = [0, 1, 2, 3, 4, 5, 6].map((d) => addDays(monday, d));
      for (const [i, day] of days.entries()) {
        await createSlotWithTables(employeeRequest, day, '12:00', '13:00', oneTable(i + 1));
      }

      const { status, body } = await repeat(employeeRequest, {
        sourceStartDate: monday,
        repeatWeeks: 1,
      });

      expect(status).toBe(201);
      expect(body.createdSlotsCount).toBe(7);
      for (const [i, day] of days.entries()) {
        expect(await scheduleOf(employeeRequest, addDays(day, 7))).toMatchObject([
          { startTime: '12:00', endTime: '13:00', tables: oneTable(i + 1) },
        ]);
      }
    });

    test('copies a week across the new year onto the right dates', async ({ employeeRequest }) => {
      // The Monday of the last week of a random year of the MH-09 range: its copy is in January.
      const year = 2200 + randomInt(0, 380);
      const newYearsEve = new Date(Date.UTC(year, 11, 31));
      newYearsEve.setUTCDate(31 - ((newYearsEve.getUTCDay() + 6) % 7));
      const monday = newYearsEve.toISOString().slice(0, 10);
      const sunday = addDays(monday, 6);
      await createSlotWithTables(employeeRequest, monday, '12:00', '13:00', oneTable(4));
      await createSlotWithTables(employeeRequest, sunday, '19:00', '20:00', oneTable(6));

      const { status, body } = await repeat(employeeRequest, {
        sourceStartDate: monday,
        repeatWeeks: 1,
      });

      expect(status).toBe(201);
      expect(body.createdSlots.map((slot) => slot.date)).toEqual([
        addDays(monday, 7),
        addDays(sunday, 7),
      ]);
      expect(addDays(sunday, 7).startsWith(String(year + 1))).toBe(true);
    });

    test('repeating the same week again replaces the previous copies without duplicates', async ({
      employeeRequest,
    }) => {
      const monday = uniqueMondayDate();
      await createSlotWithTables(employeeRequest, monday, '12:00', '13:30', oneTable(4));
      await createSlotWithTables(employeeRequest, addDays(monday, 2), '19:00', '20:00', [
        { tableNumber: 1, seats: 2 },
        { tableNumber: 2, seats: 6 },
      ]);

      const first = await repeat(employeeRequest, { sourceStartDate: monday, repeatWeeks: 2 });
      const second = await repeat(employeeRequest, { sourceStartDate: monday, repeatWeeks: 2 });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body).toMatchObject({ createdSlotsCount: 4, replacedSlotsCount: 4 });
      // The second copy is the same schedule as the first, with new slots in place of the old ones.
      const firstIds = first.body.createdSlots.map((slot) => slot.id);
      expect(second.body.createdSlots.some((slot) => firstIds.includes(slot.id))).toBe(false);
      for (const week of [1, 2]) {
        expect(await scheduleOf(employeeRequest, addDays(monday, 7 * week))).toMatchObject([
          { startTime: '12:00', tables: oneTable(4) },
        ]);
        expect(await scheduleOf(employeeRequest, addDays(monday, 7 * week + 2))).toHaveLength(1);
      }
    });
  });
});