import { randomInt, randomUUID } from 'node:crypto';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.js';
import {
  createPredefinedHike,
  deletePredefinedHike,
  removeHikerProfile,
} from '../../fixtures/db.js';

// MH-20: a hiker registers a planned hike before departure, so that the hut knows where to look
// if the hiker does not come back. Every test has its own hiker (`registeredUser`), so the
// overlap rule never sees the hikes of another test.

interface RegisteredHike {
  id: number;
  destination: string;
  route: string;
  passagePoints: string[];
  departureDate: string;
  departureTime: string;
  returnDate: string;
  returnTime: string;
  predefinedHikeId: number | null;
}

interface StaffHike extends RegisteredHike {
  hiker: {
    id: number;
    fullName: string;
    email: string | null;
    phone: string | null;
    emergencyContact: string | null;
  };
}

// The hut-local date (YYYY-MM-DD) `days` days from now.
const hutDate = (days: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(
    new Date(Date.now() + days * 86_400_000),
  );

// A day of its own, far enough to be in the future whatever the clock.
const futureDay = (): string => hutDate(30 + randomInt(3_000));

// A valid hike: a unique destination, one day out from 08:00 to 17:00.
function hikeBody(patch: Record<string, unknown> = {}): Record<string, unknown> {
  const day = futureDay();
  return {
    destination: `Monte Vettore ${randomUUID()}`,
    route: 'From Forca di Presta via Rifugio Zilioli',
    passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
    departureDate: day,
    departureTime: '08:00',
    returnDate: day,
    returnTime: '17:00',
    ...patch,
  };
}

const register = (client: APIRequestContext, body: Record<string, unknown>): Promise<APIResponse> =>
  client.post('/api/hikes', { data: body });

async function myHikes(client: APIRequestContext): Promise<RegisteredHike[]> {
  const res = await client.get('/api/hikes/mine');
  expect(res.status()).toBe(200);
  return (await res.json()) as RegisteredHike[];
}

test.describe('MH-20: Register a hike', () => {
  test.describe('Role-based access control', () => {
    for (const [method, path] of [
      ['POST', '/api/hikes'],
      ['GET', '/api/hikes/predefined'],
      ['GET', '/api/hikes/mine'],
      ['GET', '/api/staff/hikes'],
    ] as const) {
      test(`${method} ${path} needs a session (401)`, async ({ request }) => {
        const res = await request.fetch(path, {
          method,
          ...(method === 'POST' ? { data: hikeBody() } : {}),
        });
        expect(res.status()).toBe(401);
        expect((await res.json()).message).toBe('Not authenticated');
      });
    }

    test('the staff cannot register a hike (403)', async ({ employeeRequest, wardenRequest }) => {
      for (const client of [employeeRequest, wardenRequest]) {
        const res = await register(client, hikeBody());
        expect(res.status()).toBe(403);
        expect((await res.json()).message).toBe('Operation not allowed for your role');
      }
    });

    test('the staff have no own hikes and no hut list (403)', async ({ employeeRequest }) => {
      for (const path of ['/api/hikes/mine', '/api/hikes/predefined']) {
        expect((await employeeRequest.get(path)).status()).toBe(403);
      }
    });

    test('a hiker cannot read the list of the staff (403)', async ({ loggedInRequest }) => {
      const res = await loggedInRequest.get('/api/staff/hikes');
      expect(res.status()).toBe(403);
      expect((await res.json()).message).toBe('Operation not allowed for your role');
    });

    test('a hiker account without a hiker profile cannot register (403)', async ({
      loggedInRequest,
      registeredUser,
    }) => {
      removeHikerProfile(registeredUser.email);

      const res = await register(loggedInRequest, hikeBody());
      expect(res.status()).toBe(403);
      expect((await res.json()).message).toBe('A hiker profile is required to register a hike');

      const mine = await loggedInRequest.get('/api/hikes/mine');
      expect(mine.status()).toBe(403);
      expect((await mine.json()).message).toBe('A hiker profile is required to see your hikes');
    });
  });

  test.describe('Registering a hike', () => {
    test('registers the hike and answers with it (201)', async ({ loggedInRequest }) => {
      const body = hikeBody();
      const res = await register(loggedInRequest, body);

      expect(res.status()).toBe(201);
      const hike = (await res.json()) as RegisteredHike;
      expect(hike).toEqual({ id: expect.any(Number), predefinedHikeId: null, ...body });
    });

    test('stores the text trimmed and the passage points in their order', async ({
      loggedInRequest,
    }) => {
      const destination = `Pizzo del Diavolo ${randomUUID()}`;
      const res = await register(
        loggedInRequest,
        hikeBody({
          destination: `  ${destination}  `,
          route: '  Via the Chiaretto lake ',
          passagePoints: [' Viso Mozzo ', 'Lago di Pilato', 'Forca Viola'],
        }),
      );
      expect(res.status()).toBe(201);

      const [saved] = await myHikes(loggedInRequest);
      expect(saved?.destination).toBe(destination);
      expect(saved?.route).toBe('Via the Chiaretto lake');
      expect(saved?.passagePoints).toEqual(['Viso Mozzo', 'Lago di Pilato', 'Forca Viola']);
    });

    test('a hike may have no passage points', async ({ loggedInRequest }) => {
      const body = hikeBody();
      delete body.passagePoints;
      const res = await register(loggedInRequest, body);
      expect(res.status()).toBe(201);
      expect(((await res.json()) as RegisteredHike).passagePoints).toEqual([]);
    });

    test('a hike can last several days', async ({ loggedInRequest }) => {
      const departure = futureDay();
      const res = await register(
        loggedInRequest,
        hikeBody({ departureDate: departure, returnDate: hutDate(3_100), returnTime: '07:00' }),
      );
      expect(res.status()).toBe(201);
    });
  });

  test.describe('Validation (400)', () => {
    const day = '2040-06-01';
    const cases: [string, Record<string, unknown>][] = [
      ['no destination', { destination: undefined }],
      ['a destination of spaces', { destination: '   ' }],
      ['a destination over 100 characters', { destination: 'x'.repeat(101) }],
      ['no route', { route: undefined }],
      ['a route over 500 characters', { route: 'x'.repeat(501) }],
      [
        'more than 10 passage points',
        { passagePoints: Array.from({ length: 11 }, (_, i) => `P${i}`) },
      ],
      ['an empty passage point', { passagePoints: ['Viso Mozzo', ' '] }],
      ['a passage point over 100 characters', { passagePoints: ['x'.repeat(101)] }],
      ['no departure date', { departureDate: undefined }],
      ['an impossible date', { departureDate: '2040-02-30', returnDate: '2040-03-01' }],
      ['a time not as HH:MM', { departureTime: '8:00' }],
      ['no return time', { returnTime: undefined }],
      [
        'a return at the departure',
        { departureDate: day, returnDate: day, departureTime: '08:00', returnTime: '08:00' },
      ],
      [
        'a return before the departure',
        {
          departureDate: day,
          returnDate: '2040-05-31',
          departureTime: '08:00',
          returnTime: '17:00',
        },
      ],
      ['a predefined hike id that is not a number', { predefinedHikeId: 'one' }],
    ];

    for (const [name, patch] of cases) {
      test(`refuses ${name}`, async ({ loggedInRequest }) => {
        const res = await register(loggedInRequest, hikeBody(patch));
        expect(res.status()).toBe(400);
        const body = (await res.json()) as { message: string; issues?: unknown[] };
        expect(body.message).toBe('Invalid data');
        expect(body.issues?.length).toBeGreaterThan(0);
        expect(await myHikes(loggedInRequest)).toEqual([]);
      });
    }

    test('ignores a hiker sent in the body: the hiker is the session user', async ({
      loggedInRequest,
      employeeRequest,
    }) => {
      const res = await register(loggedInRequest, { ...hikeBody(), hikerId: 1, userId: 1 });
      expect(res.status()).toBe(201);
      const { id } = (await res.json()) as RegisteredHike;

      const staff = (await (await employeeRequest.get('/api/staff/hikes')).json()) as StaffHike[];
      const mine = await myHikes(loggedInRequest);
      expect(mine.map((h) => h.id)).toEqual([id]);
      expect(staff.find((h) => h.id === id)?.hiker.id).not.toBe(1);
    });
  });

  test.describe('Departure in the future, hut time (422)', () => {
    test('refuses a departure that has already come', async ({ loggedInRequest }) => {
      const res = await register(
        loggedInRequest,
        hikeBody({ departureDate: hutDate(-1), returnDate: hutDate(1) }),
      );
      expect(res.status()).toBe(422);
      expect((await res.json()).message).toBe('The planned departure must be in the future');
      expect(await myHikes(loggedInRequest)).toEqual([]);
    });
  });

  test.describe('One hike at a time (409)', () => {
    test('refuses a hike that overlaps another hike of the same hiker', async ({
      loggedInRequest,
    }) => {
      const first = hikeBody({ destination: `Monte Sibilla ${randomUUID()}` });
      expect((await register(loggedInRequest, first)).status()).toBe(201);

      const res = await register(
        loggedInRequest,
        hikeBody({
          departureDate: first.departureDate,
          departureTime: '12:00',
          returnDate: first.returnDate,
          returnTime: '19:00',
        }),
      );
      expect(res.status()).toBe(409);
      expect((await res.json()).message).toBe(
        `This hike overlaps your hike to ${String(first.destination)} ` +
          `(${String(first.departureDate)} 08:00 – ${String(first.returnDate)} 17:00)`,
      );
      expect(await myHikes(loggedInRequest)).toHaveLength(1);
    });

    test('accepts a hike that starts when the other comes back', async ({ loggedInRequest }) => {
      const first = hikeBody();
      expect((await register(loggedInRequest, first)).status()).toBe(201);

      const next = hikeBody({
        departureDate: first.returnDate,
        departureTime: '17:00',
        returnDate: first.returnDate,
        returnTime: '20:00',
      });
      expect((await register(loggedInRequest, next)).status()).toBe(201);
    });

    test('the same hike of two hikers is not an overlap', async ({
      loggedInRequest,
      playwright,
      baseURL,
      newUser,
    }) => {
      const body = hikeBody();
      expect((await register(loggedInRequest, body)).status()).toBe(201);

      // A second hiker with the same plan.
      const other = await playwright.request.newContext({ baseURL });
      const second = { ...newUser, email: `e2e-${randomUUID()}@example.test` };
      expect((await other.post('/api/auth/register', { data: second })).status()).toBe(201);
      expect(
        (
          await other.post('/api/auth/login', {
            data: { email: second.email, password: second.password },
          })
        ).status(),
      ).toBe(200);
      expect((await register(other, body)).status()).toBe(201);
      await other.dispose();
    });

    test('of two identical registrations sent together, one is stored', async ({
      loggedInRequest,
    }) => {
      const body = hikeBody();
      const statuses = (
        await Promise.all([register(loggedInRequest, body), register(loggedInRequest, body)])
      ).map((r) => r.status());

      expect(statuses.sort()).toEqual([201, 409]);
      expect(await myHikes(loggedInRequest)).toHaveLength(1);
    });
  });

  test.describe('Predefined hikes', () => {
    let predefinedId: number;
    let destination: string;

    test.beforeEach(() => {
      destination = `Monte Bove ${randomUUID()}`;
      predefinedId = createPredefinedHike(destination, 'From Frontignano', [
        'Rifugio del Fargno',
        'Forcella Angagnola',
      ]);
    });

    test.afterEach(() => {
      deletePredefinedHike(predefinedId);
    });

    test('lists the hut hikes for a hiker', async ({ loggedInRequest }) => {
      const res = await loggedInRequest.get('/api/hikes/predefined');
      expect(res.status()).toBe(200);
      const list = (await res.json()) as {
        id: number;
        destination: string;
        route: string;
        passagePoints: string[];
      }[];
      expect(list).toContainEqual({
        id: predefinedId,
        destination,
        route: 'From Frontignano',
        passagePoints: ['Rifugio del Fargno', 'Forcella Angagnola'],
      });
    });

    test('a registration keeps the predefined hike it started from, with its own changes', async ({
      loggedInRequest,
    }) => {
      const res = await register(
        loggedInRequest,
        hikeBody({
          destination,
          route: 'From Frontignano, back via Pizzo Tre Vescovi',
          passagePoints: ['Rifugio del Fargno'],
          predefinedHikeId: predefinedId,
        }),
      );
      expect(res.status()).toBe(201);

      const [saved] = await myHikes(loggedInRequest);
      expect(saved?.predefinedHikeId).toBe(predefinedId);
      expect(saved?.route).toBe('From Frontignano, back via Pizzo Tre Vescovi');
      expect(saved?.passagePoints).toEqual(['Rifugio del Fargno']);
    });

    test('refuses a predefined hike that does not exist (404)', async ({ loggedInRequest }) => {
      deletePredefinedHike(predefinedId);
      const res = await register(loggedInRequest, hikeBody({ predefinedHikeId: predefinedId }));
      expect(res.status()).toBe(404);
      expect((await res.json()).message).toBe('Predefined hike not found');
      expect(await myHikes(loggedInRequest)).toEqual([]);
    });
  });

  test.describe('Reading the hikes', () => {
    test('a hiker reads only their own hikes, the latest departure first', async ({
      loggedInRequest,
    }) => {
      const sooner = hikeBody({ departureDate: hutDate(40), returnDate: hutDate(40) });
      const later = hikeBody({ departureDate: hutDate(50), returnDate: hutDate(50) });
      expect((await register(loggedInRequest, sooner)).status()).toBe(201);
      expect((await register(loggedInRequest, later)).status()).toBe(201);

      const mine = await myHikes(loggedInRequest);
      expect(mine.map((h) => h.destination)).toEqual([later.destination, sooner.destination]);
    });

    test('the staff read every hike with the contacts of its hiker', async ({
      loggedInRequest,
      registeredUser,
      employeeRequest,
      wardenRequest,
    }) => {
      const res = await register(loggedInRequest, hikeBody());
      const { id } = (await res.json()) as RegisteredHike;

      for (const client of [employeeRequest, wardenRequest]) {
        const list = await client.get('/api/staff/hikes');
        expect(list.status()).toBe(200);
        const hike = ((await list.json()) as StaffHike[]).find((h) => h.id === id);
        expect(hike?.hiker).toEqual({
          id: expect.any(Number),
          fullName: registeredUser.fullName,
          email: registeredUser.email,
          phone: registeredUser.phone,
          emergencyContact: null,
        });
      }
    });
  });
});
