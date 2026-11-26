import type { RegisterHikeData } from '@mountain-hut/shared';
import { loadAppConfig } from '../src/config/app-config.js';
import { RegisterHike } from '../src/hikes/application/register-hike.js';
import { ListPredefinedHikes } from '../src/hikes/application/list-predefined-hikes.js';
import { PrismaHikesRepository } from '../src/hikes/infrastructure/prisma-hikes.repository.js';
import { PrismaUnitOfWork } from '../src/infrastructure/prisma/prisma-unit-of-work.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { TransactionContext } from '../src/infrastructure/prisma/transaction-context.js';
import { createHiker, resetDatabase } from './integration/database.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 08:00 at the hut (Europe/Rome, summer time).
const NOW = new Date('2031-07-01T06:00:00.000Z');

const HIKE: RegisterHikeData = {
  destination: 'Rifugio Quintino Sella',
  route: 'via the Chiaretto lake',
  passagePoints: ['Pian del Re', 'Viso Mozzo'],
  departureDate: '2031-07-02',
  departureTime: '07:30',
  returnDate: '2031-07-02',
  returnTime: '17:00',
};

const period = (
  departureDate: string,
  departureTime: string,
  returnDate: string,
  returnTime: string,
): RegisterHikeData => ({ ...HIKE, departureDate, departureTime, returnDate, returnTime });

describe('Hikes with PostgreSQL (integration) - MH-20', () => {
  const config = loadAppConfig({ ...process.env, JWT_SECRET: 'int-test-secret' });
  const prisma = new PrismaService(config);
  const context = new TransactionContext(prisma);
  const uow = new PrismaUnitOfWork(prisma, context);
  const repo = new PrismaHikesRepository(context);
  const register = new RegisterHike(uow, repo, config);
  const listPredefined = new ListPredefinedHikes(repo);

  const hikeCount = () => prisma.hike.count();

  const createPredefined = (destination: string, route: string, passagePoints: string[] = []) =>
    prisma.predefinedHike.create({ data: { destination, route, passagePoints } });

  beforeEach(async () => {
    await resetDatabase(prisma);
    // resetDatabase does not empty the hut's list: it is reference data, not linked to a hiker.
    await prisma.$executeRaw`TRUNCATE predefined_hikes RESTART IDENTITY CASCADE`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('storage', () => {
    it('stores the hike and returns it as registered', async () => {
      const { userId, hikerId } = await createHiker(prisma, 'anna@example.test');

      const hike = await register.execute(userId, HIKE, NOW);

      expect(hike).toEqual({
        id: expect.any(Number),
        destination: HIKE.destination,
        route: HIKE.route,
        passagePoints: ['Pian del Re', 'Viso Mozzo'],
        departureDate: '2031-07-02',
        departureTime: '07:30',
        returnDate: '2031-07-02',
        returnTime: '17:00',
        predefinedHikeId: null,
      });
      const row = await prisma.hike.findUniqueOrThrow({ where: { id: hike.id } });
      expect(row.hikerId).toBe(hikerId);
    });

    it('keeps the passage points in the order they are passed', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');
      const passagePoints = ['Viso Mozzo', 'Pian del Re', 'Lago Fiorenza'];

      const hike = await register.execute(userId, { ...HIKE, passagePoints }, NOW);

      const row = await prisma.hike.findUniqueOrThrow({ where: { id: hike.id } });
      expect(row.passagePoints).toEqual(passagePoints);
    });

    it('stores a hike without passage points', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');

      const hike = await register.execute(userId, { ...HIKE, passagePoints: [] }, NOW);

      expect(hike.passagePoints).toEqual([]);
    });

    it('stores the hut-local date and time as written, in summer and in winter', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');
      await register.execute(userId, period('2031-07-02', '07:30', '2031-07-02', '17:00'), NOW);
      await register.execute(userId, period('2031-12-15', '23:45', '2031-12-16', '00:15'), NOW);

      const rows = await prisma.$queryRaw<{ departure: string; return: string }[]>`
        SELECT to_char(departure_at, 'YYYY-MM-DD HH24:MI') AS departure,
               to_char(return_at, 'YYYY-MM-DD HH24:MI') AS return
        FROM hikes ORDER BY departure_at`;

      expect(rows).toEqual([
        { departure: '2031-07-02 07:30', return: '2031-07-02 17:00' },
        { departure: '2031-12-15 23:45', return: '2031-12-16 00:15' },
      ]);
    });

    it('accepts a hike over several days', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');

      const hike = await register.execute(
        userId,
        period('2031-07-02', '06:00', '2031-07-05', '18:00'),
        NOW,
      );

      expect([hike.returnDate, hike.returnTime]).toEqual(['2031-07-05', '18:00']);
    });
  });

  describe('who can register', () => {
    it('refuses a user without a hiker profile and stores nothing', async () => {
      const user = await prisma.user.create({
        data: { email: 'staff@example.test', password: 'not-used', role: 'EMPLOYEE' },
      });

      await expect(register.execute(user.id, HIKE, NOW)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'A hiker profile is required to register a hike',
      });
      expect(await hikeCount()).toBe(0);
    });

    it.each([0, -1, 2_147_483_648])(
      'refuses the user id %d, outside the database range, without a database error',
      async (userId) => {
        await expect(register.execute(userId, HIKE, NOW)).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      },
    );
  });

  describe('departure before now', () => {
    it.each([
      ['in the current minute', '2031-07-01', '08:00'],
      ['one minute ago', '2031-07-01', '07:59'],
      ['yesterday', '2031-06-30', '09:00'],
    ])('refuses a departure %s at the hut and stores nothing', async (_, date, time) => {
      const { userId } = await createHiker(prisma, 'anna@example.test');

      await expect(
        register.execute(userId, period(date, time, '2031-07-03', '18:00'), NOW),
      ).rejects.toMatchObject({
        code: 'UNPROCESSABLE',
        message: 'The planned departure must be in the future',
      });
      expect(await hikeCount()).toBe(0);
    });

    it('accepts a departure one minute ahead at the hut', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');

      await register.execute(userId, period('2031-07-01', '08:01', '2031-07-01', '12:00'), NOW);

      expect(await hikeCount()).toBe(1);
    });

    it('compares with the time of the hut in winter too (UTC+1)', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');
      // 08:00 at the hut.
      const winterNow = new Date('2031-12-01T07:00:00.000Z');

      await expect(
        register.execute(userId, period('2031-12-01', '08:00', '2031-12-01', '12:00'), winterNow),
      ).rejects.toMatchObject({ code: 'UNPROCESSABLE' });
      await register.execute(
        userId,
        period('2031-12-01', '08:01', '2031-12-01', '12:00'),
        winterNow,
      );
      expect(await hikeCount()).toBe(1);
    });
  });

  describe('overlapping hikes', () => {
    it.each([
      ['the same period', '2031-07-02', '07:30', '2031-07-02', '17:00'],
      ['a period inside it', '2031-07-02', '10:00', '2031-07-02', '12:00'],
      ['a period around it', '2031-07-02', '06:00', '2031-07-02', '20:00'],
      ['a period that starts during it', '2031-07-02', '16:00', '2031-07-03', '10:00'],
      ['a period that ends during it', '2031-07-01', '20:00', '2031-07-02', '08:00'],
    ])(
      'refuses %s for the same hiker and stores nothing',
      async (_, depDate, depTime, retDate, retTime) => {
        const { userId } = await createHiker(prisma, 'anna@example.test');
        await register.execute(userId, HIKE, NOW);

        await expect(
          register.execute(userId, period(depDate, depTime, retDate, retTime), NOW),
        ).rejects.toMatchObject({
          code: 'CONFLICT',
          message:
            'This hike overlaps your hike to Rifugio Quintino Sella (2031-07-02 07:30 – 2031-07-02 17:00)',
        });
        expect(await hikeCount()).toBe(1);
      },
    );

    it('accepts hikes that only touch: one returns when the next departs', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');
      await register.execute(userId, HIKE, NOW);

      await register.execute(userId, period('2031-07-02', '17:00', '2031-07-02', '20:00'), NOW);
      await register.execute(userId, period('2031-07-02', '05:00', '2031-07-02', '07:30'), NOW);

      expect(await hikeCount()).toBe(3);
    });

    it('lets two hikers register the same period', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const marco = await createHiker(prisma, 'marco@example.test');

      await register.execute(anna.userId, HIKE, NOW);
      await register.execute(marco.userId, HIKE, NOW);

      expect(await hikeCount()).toBe(2);
    });
  });

  describe('predefined hikes', () => {
    it('lists the hut hikes by destination, then by route', async () => {
      await createPredefined('Pian del Re', 'via the Po springs');
      await createPredefined('Lago Fiorenza', 'via the forest', ['Pian della Regina']);
      await createPredefined('Lago Fiorenza', 'via the cart track');

      const list = await listPredefined.execute();

      expect(list).toEqual([
        {
          id: expect.any(Number),
          destination: 'Lago Fiorenza',
          route: 'via the cart track',
          passagePoints: [],
        },
        {
          id: expect.any(Number),
          destination: 'Lago Fiorenza',
          route: 'via the forest',
          passagePoints: ['Pian della Regina'],
        },
        {
          id: expect.any(Number),
          destination: 'Pian del Re',
          route: 'via the Po springs',
          passagePoints: [],
        },
      ]);
    });

    it('keeps the link to the predefined hike and the values the hiker sent', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');
      const predefined = await createPredefined(HIKE.destination, 'via the normal path', [
        'Pian del Re',
      ]);

      const hike = await register.execute(
        userId,
        { ...HIKE, predefinedHikeId: predefined.id },
        NOW,
      );

      expect(hike.predefinedHikeId).toBe(predefined.id);
      expect(hike.route).toBe(HIKE.route);
      expect(hike.passagePoints).toEqual(HIKE.passagePoints);
    });

    it('refuses a predefined hike that does not exist and stores nothing', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');

      await expect(
        register.execute(userId, { ...HIKE, predefinedHikeId: 999 }, NOW),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Predefined hike not found' });
      expect(await hikeCount()).toBe(0);
    });

    it('keeps the hike when its predefined hike is deleted, without the link', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');
      const predefined = await createPredefined(HIKE.destination, HIKE.route);
      const hike = await register.execute(
        userId,
        { ...HIKE, predefinedHikeId: predefined.id },
        NOW,
      );

      await prisma.predefinedHike.delete({ where: { id: predefined.id } });

      const row = await prisma.hike.findUniqueOrThrow({ where: { id: hike.id } });
      expect(row.predefinedHikeId).toBeNull();
      expect(row.destination).toBe(HIKE.destination);
    });
  });

  describe('database constraints', () => {
    const rowFor = (hikerId: number, departureAt: string, returnAt: string) => ({
      hikerId,
      destination: 'Pian del Re',
      route: 'via the Po springs',
      departureAt: new Date(`${departureAt}:00.000Z`),
      returnAt: new Date(`${returnAt}:00.000Z`),
    });

    it.each([
      ['equal to', '2031-07-02T10:00'],
      ['before', '2031-07-02T09:00'],
    ])('refuses a return %s the departure (CHECK)', async (_, returnAt) => {
      const { hikerId } = await createHiker(prisma, 'anna@example.test');

      await expect(
        prisma.hike.create({ data: rowFor(hikerId, '2031-07-02T10:00', returnAt) }),
      ).rejects.toThrow();
    });

    it('refuses a hike of a hiker that does not exist (foreign key)', async () => {
      await expect(
        prisma.hike.create({ data: rowFor(999, '2031-07-02T10:00', '2031-07-02T12:00') }),
      ).rejects.toThrow();
    });

    it('deletes the hikes together with their hiker (ON DELETE CASCADE)', async () => {
      const anna = await createHiker(prisma, 'anna@example.test');
      const marco = await createHiker(prisma, 'marco@example.test');
      await register.execute(anna.userId, HIKE, NOW);
      await register.execute(marco.userId, HIKE, NOW);

      await prisma.hiker.delete({ where: { id: anna.hikerId } });

      const rows = await prisma.hike.findMany();
      expect(rows.map((r) => r.hikerId)).toEqual([marco.hikerId]);
    });

    it('refuses two predefined hikes with the same destination and route', async () => {
      await createPredefined('Pian del Re', 'via the Po springs');

      await expect(createPredefined('Pian del Re', 'via the Po springs')).rejects.toThrow();
    });
  });

  describe('concurrency', () => {
    it('of two identical registrations sent together, one is stored and one conflicts', async () => {
      const { userId } = await createHiker(prisma, 'anna@example.test');

      const results = await Promise.allSettled([
        register.execute(userId, HIKE, NOW),
        register.execute(userId, HIKE, NOW),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'CONFLICT' });
      expect(await hikeCount()).toBe(1);
    });

    it('locks the hiker: a second transaction waits until the first one ends', async () => {
      const { hikerId } = await createHiker(prisma, 'anna@example.test');
      const log: string[] = [];
      let firstHasLock!: () => void;
      const firstLocked = new Promise<void>((resolve) => (firstHasLock = resolve));

      const first = uow.run(async () => {
        await repo.lockHiker(hikerId);
        log.push('first locked');
        firstHasLock();
        await sleep(200);
        log.push('first done');
      });
      const second = (async () => {
        await firstLocked;
        await uow.run(async () => {
          log.push('second waiting');
          await repo.lockHiker(hikerId);
          log.push('second locked');
        });
      })();
      await Promise.all([first, second]);

      expect(log).toEqual(['first locked', 'second waiting', 'first done', 'second locked']);
    });
  });
});
