import { randomInt } from 'node:crypto';
import { expect, test } from '../../fixtures/auth.js';

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

// Generates a random future date so parallel tests never collide on (date, startTime, endTime).
function uniqueDate(): string {
  const dayOffset = randomInt(5000, 25000);
  const d = new Date(Date.UTC(2035, 0, 1) + dayOffset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

test.describe('MH-02: Slot capacity and table definition', () => {
  test.describe('Role-based access control', () => {
    test('refuses unauthenticated requests with 401', async ({ request }) => {
      const date = uniqueDate();
      expect(
        (
          await request.post('/api/slots', { data: { date, startTime: '12:00', endTime: '14:00' } })
        ).status(),
      ).toBe(401);
      expect((await request.get(`/api/slots/schedule?date=${date}`)).status()).toBe(401);
      expect((await request.get('/api/slots/1')).status()).toBe(401);
      expect(
        (
          await request.put('/api/slots/1/tables', {
            data: { tables: [{ tableNumber: 1, seats: 4 }] },
          })
        ).status(),
      ).toBe(401);
    });

    test('forbids hikers (standard users) with 403', async ({ loggedInRequest }) => {
      const date = uniqueDate();
      expect(
        (
          await loggedInRequest.post('/api/slots', {
            data: { date, startTime: '12:00', endTime: '14:00' },
          })
        ).status(),
      ).toBe(403);
      expect((await loggedInRequest.get(`/api/slots/schedule?date=${date}`)).status()).toBe(403);
      expect((await loggedInRequest.get('/api/slots/1')).status()).toBe(403);
      expect(
        (
          await loggedInRequest.put('/api/slots/1/tables', {
            data: { tables: [{ tableNumber: 1, seats: 4 }] },
          })
        ).status(),
      ).toBe(403);
    });

    test('allows employee to manage slots', async ({ employeeRequest }) => {
      const date = uniqueDate();
      const res = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:00',
          endTime: '13:00',
          tables: [{ tableNumber: 1, seats: 4 }],
        },
      });
      expect(res.status()).toBe(201);
    });

    test('allows warden to manage slots as staff', async ({ wardenRequest }) => {
      const date = uniqueDate();
      const res = await wardenRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:00',
          endTime: '13:00',
          tables: [{ tableNumber: 1, seats: 4 }],
        },
      });
      expect(res.status()).toBe(201);
    });
  });

  test.describe('Defining tables and slot capacity', () => {
    test('defines tables and seats for a slot, computing total seats correctly', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();
      const createRes = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:00',
          endTime: '14:00',
          tables: [
            { tableNumber: 1, seats: 2 },
            { tableNumber: 2, seats: 4 },
            { tableNumber: 3, seats: 6 },
          ],
        },
      });
      expect(createRes.status()).toBe(201);
      const created = (await createRes.json()) as SlotDetails;

      expect(created).toMatchObject({
        id: expect.any(Number),
        date,
        startTime: '12:00',
        endTime: '14:00',
        totalSeats: 12,
        tables: [
          { tableNumber: 1, seats: 2 },
          { tableNumber: 2, seats: 4 },
          { tableNumber: 3, seats: 6 },
        ],
      });

      // Verify the details can be fetched individually
      const getRes = await employeeRequest.get(`/api/slots/${created.id}`);
      expect(getRes.status()).toBe(200);
      const fetched = (await getRes.json()) as SlotDetails;
      expect(fetched).toEqual(created);
    });

    test('allows creating a slot without tables initially (0 total seats)', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();
      const res = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:00',
          endTime: '13:00',
        },
      });
      expect(res.status()).toBe(201);
      const slot = (await res.json()) as SlotDetails;
      expect(slot.tables).toEqual([]);
      expect(slot.totalSeats).toBe(0);
    });

    test('defines tables on an existing slot that has none yet via PUT /api/slots/:id/tables', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();
      const emptySlotRes = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:00',
          endTime: '13:30',
        },
      });
      expect(emptySlotRes.status()).toBe(201);
      const emptySlot = (await emptySlotRes.json()) as SlotDetails;
      expect(emptySlot.totalSeats).toBe(0);

      const defineRes = await employeeRequest.put(`/api/slots/${emptySlot.id}/tables`, {
        data: {
          tables: [
            { tableNumber: 10, seats: 4 },
            { tableNumber: 11, seats: 8 },
          ],
        },
      });
      expect(defineRes.status()).toBe(200);
      const updated = (await defineRes.json()) as SlotDetails;
      expect(updated.id).toBe(emptySlot.id);
      expect(updated.totalSeats).toBe(12);
      expect(updated.tables).toEqual([
        { tableNumber: 10, seats: 4 },
        { tableNumber: 11, seats: 8 },
      ]);

      const verifyRes = await employeeRequest.get(`/api/slots/${emptySlot.id}`);
      expect(verifyRes.status()).toBe(200);
      expect(await verifyRes.json()).toEqual(updated);
    });
  });

  test.describe('Flexible starting time and duration (Clarification 1)', () => {
    test('supports short slots such as 30 minutes', async ({ employeeRequest }) => {
      const date = uniqueDate();
      const res = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:00',
          endTime: '12:30',
          tables: [{ tableNumber: 1, seats: 4 }],
        },
      });
      expect(res.status()).toBe(201);
      const slot = (await res.json()) as SlotDetails;
      expect(slot.startTime).toBe('12:00');
      expect(slot.endTime).toBe('12:30');
    });

    test('supports irregular and non-hour durations (e.g. 1h 15m, 1h 45m)', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();
      const slot1 = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:45',
          endTime: '14:00',
          tables: [{ tableNumber: 1, seats: 2 }],
        },
      });
      expect(slot1.status()).toBe(201);

      const slot2 = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '14:15',
          endTime: '16:00',
          tables: [{ tableNumber: 1, seats: 4 }],
        },
      });
      expect(slot2.status()).toBe(201);
    });

    test('supports slots spanning different times of day (breakfast, afternoon, dinner)', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();
      const morningRes = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '07:30',
          endTime: '09:00',
          tables: [{ tableNumber: 1, seats: 4 }],
        },
      });
      expect(morningRes.status()).toBe(201);

      const afternoonRes = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '15:30',
          endTime: '17:00',
          tables: [{ tableNumber: 1, seats: 4 }],
        },
      });
      expect(afternoonRes.status()).toBe(201);

      const eveningRes = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '19:30',
          endTime: '22:30',
          tables: [{ tableNumber: 1, seats: 6 }],
        },
      });
      expect(eveningRes.status()).toBe(201);
    });
  });

  test.describe('Multiple slots per day and meal service scheduling (Clarification 3)', () => {
    test('supports multiple slots for a meal service (e.g. 12-13 and 13-14) and orders them chronologically', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();

      // Create in non-chronological order to verify ordering
      const dinnerRes = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '19:00',
          endTime: '21:00',
          tables: [{ tableNumber: 1, seats: 6 }],
        },
      });
      expect(dinnerRes.status()).toBe(201);

      const lunchTurn1Res = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:00',
          endTime: '13:00',
          tables: [{ tableNumber: 1, seats: 4 }],
        },
      });
      expect(lunchTurn1Res.status()).toBe(201);

      const lunchTurn2Res = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '13:00',
          endTime: '14:00',
          tables: [{ tableNumber: 1, seats: 4 }],
        },
      });
      expect(lunchTurn2Res.status()).toBe(201);

      const scheduleRes = await employeeRequest.get(`/api/slots/schedule?date=${date}`);
      expect(scheduleRes.status()).toBe(200);
      const schedule = (await scheduleRes.json()) as SlotDetails[];

      expect(schedule).toHaveLength(3);
      expect(schedule.map((s) => s.startTime)).toEqual(['12:00', '13:00', '19:00']);
      expect(schedule[0].startTime).toBe('12:00');
      expect(schedule[0].endTime).toBe('13:00');
      expect(schedule[1].startTime).toBe('13:00');
      expect(schedule[1].endTime).toBe('14:00');
      expect(schedule[2].startTime).toBe('19:00');
      expect(schedule[2].endTime).toBe('21:00');
    });

    test('filters schedule strictly by date', async ({ employeeRequest }) => {
      const dateA = uniqueDate();
      const dateB = uniqueDate();

      await employeeRequest.post('/api/slots', {
        data: { date: dateA, startTime: '12:00', endTime: '13:00' },
      });
      await employeeRequest.post('/api/slots', {
        data: { date: dateB, startTime: '12:00', endTime: '13:00' },
      });

      const resA = await employeeRequest.get(`/api/slots/schedule?date=${dateA}`);
      const listA = (await resA.json()) as SlotDetails[];
      expect(listA.every((s) => s.date === dateA)).toBe(true);

      const resB = await employeeRequest.get(`/api/slots/schedule?date=${dateB}`);
      const listB = (await resB.json()) as SlotDetails[];
      expect(listB.every((s) => s.date === dateB)).toBe(true);
    });
  });

  test.describe('No fixed table set across slots and conditions (Clarification 4)', () => {
    test('supports completely different sets of tables and seats at lunch vs dinner on the same day', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();

      // Lunch layout: 4 large tables on outdoor terrace
      const lunchRes = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:00',
          endTime: '14:00',
          tables: [
            { tableNumber: 1, seats: 6 },
            { tableNumber: 2, seats: 6 },
            { tableNumber: 3, seats: 8 },
            { tableNumber: 4, seats: 4 },
          ],
        },
      });
      expect(lunchRes.status()).toBe(201);
      const lunch = (await lunchRes.json()) as SlotDetails;
      expect(lunch.totalSeats).toBe(24);
      expect(lunch.tables).toHaveLength(4);

      // Dinner layout: 2 cozy tables indoors with different table numbers and seat counts
      const dinnerRes = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '19:30',
          endTime: '21:30',
          tables: [
            { tableNumber: 10, seats: 2 },
            { tableNumber: 11, seats: 4 },
          ],
        },
      });
      expect(dinnerRes.status()).toBe(201);
      const dinner = (await dinnerRes.json()) as SlotDetails;
      expect(dinner.totalSeats).toBe(6);
      expect(dinner.tables).toHaveLength(2);

      // Both layouts coexist independently
      const scheduleRes = await employeeRequest.get(`/api/slots/schedule?date=${date}`);
      const schedule = (await scheduleRes.json()) as SlotDetails[];
      expect(schedule.find((s) => s.id === lunch.id)?.totalSeats).toBe(24);
      expect(schedule.find((s) => s.id === dinner.id)?.totalSeats).toBe(6);
    });

    test('supports different capacity configurations for sunny vs rainy day scenarios', async ({
      employeeRequest,
    }) => {
      const sunnyDate = uniqueDate();
      const rainyDate = uniqueDate();

      // Sunny day: outdoor tables included, high capacity
      const sunnyRes = await employeeRequest.post('/api/slots', {
        data: {
          date: sunnyDate,
          startTime: '12:30',
          endTime: '14:30',
          tables: [
            { tableNumber: 1, seats: 8 },
            { tableNumber: 2, seats: 8 },
            { tableNumber: 3, seats: 8 },
            { tableNumber: 4, seats: 8 },
          ],
        },
      });
      expect(sunnyRes.status()).toBe(201);
      expect(((await sunnyRes.json()) as SlotDetails).totalSeats).toBe(32);

      // Rainy day: indoor only, reduced capacity
      const rainyRes = await employeeRequest.post('/api/slots', {
        data: {
          date: rainyDate,
          startTime: '12:30',
          endTime: '14:30',
          tables: [{ tableNumber: 1, seats: 6 }],
        },
      });
      expect(rainyRes.status()).toBe(201);
      expect(((await rainyRes.json()) as SlotDetails).totalSeats).toBe(6);
    });
  });

  test.describe('Reusing table list from previous slots (Clarification 2)', () => {
    test('copies table list when creating a slot with copyTablesFromSlotId', async ({
      employeeRequest,
    }) => {
      const sourceDate = uniqueDate();
      const targetDate = uniqueDate();

      const sourceRes = await employeeRequest.post('/api/slots', {
        data: {
          date: sourceDate,
          startTime: '12:00',
          endTime: '13:00',
          tables: [
            { tableNumber: 1, seats: 2 },
            { tableNumber: 2, seats: 4 },
            { tableNumber: 3, seats: 8 },
          ],
        },
      });
      expect(sourceRes.status()).toBe(201);
      const sourceSlot = (await sourceRes.json()) as SlotDetails;
      expect(sourceSlot.totalSeats).toBe(14);

      // Create target slot reusing tables from sourceSlot without re-entering them
      const targetRes = await employeeRequest.post('/api/slots', {
        data: {
          date: targetDate,
          startTime: '13:00',
          endTime: '14:00',
          copyTablesFromSlotId: sourceSlot.id,
        },
      });
      expect(targetRes.status()).toBe(201);
      const targetSlot = (await targetRes.json()) as SlotDetails;

      expect(targetSlot.totalSeats).toBe(14);
      expect(targetSlot.tables).toEqual(sourceSlot.tables);

      // Verify slot detail retrieval
      const fetchedTarget = await employeeRequest.get(`/api/slots/${targetSlot.id}`);
      expect((await fetchedTarget.json()) as SlotDetails).toEqual(targetSlot);
    });

    test('copies table list into an existing empty slot via PUT /api/slots/:id/tables', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();

      // Source slot with tables
      const sourceRes = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:00',
          endTime: '13:00',
          tables: [
            { tableNumber: 5, seats: 4 },
            { tableNumber: 6, seats: 6 },
          ],
        },
      });
      const sourceSlot = (await sourceRes.json()) as SlotDetails;

      // Slot created with no tables
      const emptyRes = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '13:00',
          endTime: '14:00',
        },
      });
      const emptySlot = (await emptyRes.json()) as SlotDetails;
      expect(emptySlot.totalSeats).toBe(0);

      // Copy tables from source into empty slot
      const updateRes = await employeeRequest.put(`/api/slots/${emptySlot.id}/tables`, {
        data: { copyTablesFromSlotId: sourceSlot.id },
      });
      expect(updateRes.status()).toBe(200);
      const updatedSlot = (await updateRes.json()) as SlotDetails;

      expect(updatedSlot.totalSeats).toBe(10);
      expect(updatedSlot.tables).toEqual(sourceSlot.tables);
    });

    test('returns 404 when copyTablesFromSlotId refers to a non-existent slot', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();
      const res = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:00',
          endTime: '13:00',
          copyTablesFromSlotId: 999_999_999,
        },
      });
      expect(res.status()).toBe(404);

      // Also on PUT
      const emptyRes = await employeeRequest.post('/api/slots', {
        data: { date, startTime: '13:00', endTime: '14:00' },
      });
      const emptySlot = (await emptyRes.json()) as SlotDetails;

      const putRes = await employeeRequest.put(`/api/slots/${emptySlot.id}/tables`, {
        data: { copyTablesFromSlotId: 999_999_999 },
      });
      expect(putRes.status()).toBe(404);
    });

    test('returns 422 when attempting to copy tables from a slot that has no tables', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();

      const emptySourceRes = await employeeRequest.post('/api/slots', {
        data: { date, startTime: '12:00', endTime: '13:00' },
      });
      const emptySource = (await emptySourceRes.json()) as SlotDetails;

      // Copying on create
      const res = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '13:00',
          endTime: '14:00',
          copyTablesFromSlotId: emptySource.id,
        },
      });
      expect(res.status()).toBe(422);

      // Copying on PUT
      const emptyTargetRes = await employeeRequest.post('/api/slots', {
        data: { date, startTime: '14:00', endTime: '15:00' },
      });
      const emptyTarget = (await emptyTargetRes.json()) as SlotDetails;

      const putRes = await employeeRequest.put(`/api/slots/${emptyTarget.id}/tables`, {
        data: { copyTablesFromSlotId: emptySource.id },
      });
      expect(putRes.status()).toBe(422);
    });
  });

  test.describe('Rules on table modification (MH-19 boundary)', () => {
    test('returns 409 when attempting to modify tables of a slot that already has tables', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();
      const slotRes = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:00',
          endTime: '13:00',
          tables: [{ tableNumber: 1, seats: 4 }],
        },
      });
      const slot = (await slotRes.json()) as SlotDetails;

      // Redefining tables on an already-configured slot is forbidden (belongs to MH-19)
      const putRes = await employeeRequest.put(`/api/slots/${slot.id}/tables`, {
        data: {
          tables: [{ tableNumber: 1, seats: 6 }],
        },
      });
      expect(putRes.status()).toBe(409);
    });

    test('returns 404 when defining tables for a slot that does not exist', async ({
      employeeRequest,
    }) => {
      const putRes = await employeeRequest.put('/api/slots/99999999/tables', {
        data: { tables: [{ tableNumber: 1, seats: 4 }] },
      });
      expect(putRes.status()).toBe(404);
    });
  });

  test.describe('Validation and business rules', () => {
    test('rejects endTime that is not after startTime with 400', async ({ employeeRequest }) => {
      const date = uniqueDate();

      const equalRes = await employeeRequest.post('/api/slots', {
        data: { date, startTime: '12:00', endTime: '12:00' },
      });
      expect(equalRes.status()).toBe(400);

      const earlierRes = await employeeRequest.post('/api/slots', {
        data: { date, startTime: '14:00', endTime: '13:00' },
      });
      expect(earlierRes.status()).toBe(400);
    });

    test('rejects duplicate table numbers within the same slot with 400', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();
      const res = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:00',
          endTime: '13:00',
          tables: [
            { tableNumber: 1, seats: 4 },
            { tableNumber: 1, seats: 2 },
          ],
        },
      });
      expect(res.status()).toBe(400);
    });

    test('rejects non-positive table numbers or seats with 400', async ({ employeeRequest }) => {
      const date = uniqueDate();

      expect(
        (
          await employeeRequest.post('/api/slots', {
            data: {
              date,
              startTime: '12:00',
              endTime: '13:00',
              tables: [{ tableNumber: 0, seats: 4 }],
            },
          })
        ).status(),
      ).toBe(400);

      expect(
        (
          await employeeRequest.post('/api/slots', {
            data: {
              date,
              startTime: '12:00',
              endTime: '13:00',
              tables: [{ tableNumber: 1, seats: 0 }],
            },
          })
        ).status(),
      ).toBe(400);

      expect(
        (
          await employeeRequest.post('/api/slots', {
            data: {
              date,
              startTime: '12:00',
              endTime: '13:00',
              tables: [{ tableNumber: -1, seats: 4 }],
            },
          })
        ).status(),
      ).toBe(400);

      expect(
        (
          await employeeRequest.post('/api/slots', {
            data: {
              date,
              startTime: '12:00',
              endTime: '13:00',
              tables: [{ tableNumber: 1, seats: -4 }],
            },
          })
        ).status(),
      ).toBe(400);
    });

    test('rejects providing both tables and copyTablesFromSlotId with 400', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();
      const res = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '12:00',
          endTime: '13:00',
          tables: [{ tableNumber: 1, seats: 4 }],
          copyTablesFromSlotId: 1,
        },
      });
      expect(res.status()).toBe(400);

      const putRes = await employeeRequest.put('/api/slots/1/tables', {
        data: {
          tables: [{ tableNumber: 1, seats: 4 }],
          copyTablesFromSlotId: 1,
        },
      });
      expect(putRes.status()).toBe(400);
    });

    test('rejects PUT /api/slots/:id/tables without tables or copyTablesFromSlotId with 400', async ({
      employeeRequest,
    }) => {
      const putRes = await employeeRequest.put('/api/slots/1/tables', {
        data: {},
      });
      expect(putRes.status()).toBe(400);
    });

    test('rejects invalid date and time formats with 400', async ({ employeeRequest }) => {
      // Invalid date string
      expect(
        (
          await employeeRequest.post('/api/slots', {
            data: { date: 'not-a-date', startTime: '12:00', endTime: '13:00' },
          })
        ).status(),
      ).toBe(400);

      // Non-existent calendar date
      expect(
        (
          await employeeRequest.post('/api/slots', {
            data: { date: '2026-02-31', startTime: '12:00', endTime: '13:00' },
          })
        ).status(),
      ).toBe(400);

      // Invalid time format
      expect(
        (
          await employeeRequest.post('/api/slots', {
            data: { date: '2026-07-01', startTime: '25:00', endTime: '26:00' },
          })
        ).status(),
      ).toBe(400);

      expect(
        (
          await employeeRequest.post('/api/slots', {
            data: { date: '2026-07-01', startTime: '12:60', endTime: '13:00' },
          })
        ).status(),
      ).toBe(400);
    });

    test('rejects creating a slot with the exact same date, startTime and endTime with 409', async ({
      employeeRequest,
    }) => {
      const date = uniqueDate();
      const firstRes = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '18:00',
          endTime: '20:00',
          tables: [{ tableNumber: 1, seats: 4 }],
        },
      });
      expect(firstRes.status()).toBe(201);

      const duplicateRes = await employeeRequest.post('/api/slots', {
        data: {
          date,
          startTime: '18:00',
          endTime: '20:00',
          tables: [{ tableNumber: 2, seats: 6 }],
        },
      });
      expect(duplicateRes.status()).toBe(409);
    });

    test('validates schedule query parameters', async ({ employeeRequest }) => {
      // Missing date
      expect((await employeeRequest.get('/api/slots/schedule')).status()).toBe(400);
      // Malformed date
      expect((await employeeRequest.get('/api/slots/schedule?date=invalid')).status()).toBe(400);
      // Non-existent calendar date
      expect((await employeeRequest.get('/api/slots/schedule?date=2026-02-31')).status()).toBe(400);
    });

    test('returns 404 for a non-existent slot id', async ({ employeeRequest }) => {
      const res = await employeeRequest.get('/api/slots/99999999');
      expect(res.status()).toBe(404);
    });
  });

  test.describe('API documentation', () => {
    test('documents slot endpoints in OpenAPI docs', async ({ employeeRequest }) => {
      const response = await employeeRequest.get('/api/docs-json');
      expect(response.status()).toBe(200);
      const { paths } = (await response.json()) as { paths: Record<string, unknown> };
      expect(Object.keys(paths)).toEqual(
        expect.arrayContaining([
          '/api/slots',
          '/api/slots/schedule',
          '/api/slots/{id}',
          '/api/slots/{id}/tables',
        ]),
      );
    });
  });
});
