import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { PrismaHikesRepository } from './prisma-hikes.repository.js';

// MH-20 white box: the Prisma queries of the registration (R1, R6, R8), of the hut's list (R7),
// of the hiker's hikes (R10) and of the staff list (R11). The columns hold the hut's local time
// as TIMESTAMP without time zone: Prisma maps them to Dates in UTC with the same wall clock.

const MAX_DB_INT = 2_147_483_647;

const row = {
  id: 12,
  hikerId: 7,
  predefinedHikeId: 2,
  destination: 'Monte Vettore',
  route: 'From Forca di Presta',
  passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
  departureAt: new Date('2026-11-28T08:00:00.000Z'),
  returnAt: new Date('2026-11-28T17:30:00.000Z'),
  createdAt: new Date('2026-11-27T14:45:00.000Z'),
};

const hike = {
  id: 12,
  hikerId: 7,
  predefinedHikeId: 2,
  destination: 'Monte Vettore',
  route: 'From Forca di Presta',
  passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
  departureAt: '2026-11-28T08:00',
  returnAt: '2026-11-28T17:30',
};

const invalidIds = [0, -1, 1.5, Number.NaN, MAX_DB_INT + 1];

describe('PrismaHikesRepository', () => {
  const client = {
    $queryRaw: vi.fn(),
    hiker: { findUnique: vi.fn() },
    hike: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    predefinedHike: { count: vi.fn(), findMany: vi.fn() },
  };
  // The repository reads the client of the current unit of work from the context.
  const context = { client: () => client } as unknown as TransactionContext;
  const repository = new PrismaHikesRepository(context);

  // $queryRaw is a tagged template: the SQL text comes first, then the bound values.
  const rawCall = () => client.$queryRaw.mock.calls[0] as [readonly string[], ...unknown[]];

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('findHikerIdByUserId', () => {
    it('returns the id of the hiker profile of the user', async () => {
      client.hiker.findUnique.mockResolvedValue({ id: 7 });
      await expect(repository.findHikerIdByUserId(1)).resolves.toBe(7);
      expect(client.hiker.findUnique).toHaveBeenCalledWith({
        where: { userId: 1 },
        select: { id: true },
      });
    });

    it('returns null when the user has no hiker profile', async () => {
      client.hiker.findUnique.mockResolvedValue(null);
      await expect(repository.findHikerIdByUserId(1)).resolves.toBeNull();
    });

    it.each(invalidIds)('returns null for the user id %s without querying', async (userId) => {
      await expect(repository.findHikerIdByUserId(userId)).resolves.toBeNull();
      expect(client.hiker.findUnique).not.toHaveBeenCalled();
    });

    it('queries the largest valid id', async () => {
      client.hiker.findUnique.mockResolvedValue(null);
      await repository.findHikerIdByUserId(MAX_DB_INT);
      expect(client.hiker.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('lockHiker', () => {
    it('locks the row of the hiker with a bound parameter', async () => {
      client.$queryRaw.mockResolvedValue([{ id: 7 }]);
      await expect(repository.lockHiker(7)).resolves.toBeUndefined();
      const [strings, ...values] = rawCall();
      const sql = strings.join('?').replace(/\s+/g, ' ');
      expect(sql).toBe('SELECT id FROM hikers WHERE id = ? FOR UPDATE');
      expect(values).toEqual([7]);
    });

    it('propagates a database error', async () => {
      const failure = new Error('lock timeout');
      client.$queryRaw.mockRejectedValue(failure);
      await expect(repository.lockHiker(7)).rejects.toBe(failure);
    });
  });

  describe('findOverlapping', () => {
    it('looks for a hike of the hiker that starts before the end and ends after the start', async () => {
      client.hike.findFirst.mockResolvedValue(null);
      await repository.findOverlapping(7, '2026-11-28T08:00', '2026-11-28T17:30');
      expect(client.hike.findFirst).toHaveBeenCalledWith({
        where: {
          hikerId: 7,
          departureAt: { lt: new Date('2026-11-28T17:30:00.000Z') },
          returnAt: { gt: new Date('2026-11-28T08:00:00.000Z') },
        },
        orderBy: { departureAt: 'asc' },
      });
    });

    it('uses strict comparisons, so touching hikes do not overlap', async () => {
      client.hike.findFirst.mockResolvedValue(null);
      await repository.findOverlapping(7, '2026-11-28T08:00', '2026-11-28T17:30');
      const { where } = client.hike.findFirst.mock.calls[0][0] as {
        where: { departureAt: object; returnAt: object };
      };
      expect(Object.keys(where.departureAt)).toEqual(['lt']);
      expect(Object.keys(where.returnAt)).toEqual(['gt']);
    });

    it('returns the overlapping hike with local moments', async () => {
      client.hike.findFirst.mockResolvedValue(row);
      await expect(
        repository.findOverlapping(7, '2026-11-28T10:00', '2026-11-28T12:00'),
      ).resolves.toEqual(hike);
    });

    it('returns null when nothing overlaps', async () => {
      client.hike.findFirst.mockResolvedValue(null);
      await expect(
        repository.findOverlapping(7, '2026-11-28T10:00', '2026-11-28T12:00'),
      ).resolves.toBeNull();
    });
  });

  describe('predefinedHikeExists', () => {
    it('is true when the predefined hike exists', async () => {
      client.predefinedHike.count.mockResolvedValue(1);
      await expect(repository.predefinedHikeExists(2)).resolves.toBe(true);
      expect(client.predefinedHike.count).toHaveBeenCalledWith({ where: { id: 2 } });
    });

    it('is false when it does not exist', async () => {
      client.predefinedHike.count.mockResolvedValue(0);
      await expect(repository.predefinedHikeExists(99)).resolves.toBe(false);
    });

    it.each(invalidIds)('is false for the id %s without querying', async (id) => {
      await expect(repository.predefinedHikeExists(id)).resolves.toBe(false);
      expect(client.predefinedHike.count).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('stores the hike with the local moments as UTC wall clock and maps it back', async () => {
      client.hike.create.mockResolvedValue(row);
      const newHike: Omit<typeof hike, 'id'> = {
        hikerId: hike.hikerId,
        predefinedHikeId: hike.predefinedHikeId,
        destination: hike.destination,
        route: hike.route,
        passagePoints: hike.passagePoints,
        departureAt: hike.departureAt,
        returnAt: hike.returnAt,
      };
      await expect(repository.create(newHike)).resolves.toEqual(hike);
      expect(client.hike.create).toHaveBeenCalledWith({
        data: {
          hikerId: 7,
          predefinedHikeId: 2,
          destination: 'Monte Vettore',
          route: 'From Forca di Presta',
          passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
          departureAt: new Date('2026-11-28T08:00:00.000Z'),
          returnAt: new Date('2026-11-28T17:30:00.000Z'),
        },
      });
    });

    it('keeps the local wall clock in summer time too', async () => {
      client.hike.create.mockResolvedValue({
        ...row,
        departureAt: new Date('2026-07-15T06:00:00.000Z'),
        returnAt: new Date('2026-07-15T20:00:00.000Z'),
      });
      const res = await repository.create({
        ...hike,
        departureAt: '2026-07-15T06:00',
        returnAt: '2026-07-15T20:00',
      });
      const data = (client.hike.create.mock.calls[0][0] as { data: { departureAt: Date } }).data;
      expect(data.departureAt.toISOString()).toBe('2026-07-15T06:00:00.000Z');
      expect(res.departureAt).toBe('2026-07-15T06:00');
    });

    it('stores a hike without predefined hike and without passage points', async () => {
      client.hike.create.mockResolvedValue({ ...row, predefinedHikeId: null, passagePoints: [] });
      const res = await repository.create({ ...hike, predefinedHikeId: null, passagePoints: [] });
      expect(client.hike.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ predefinedHikeId: null, passagePoints: [] }),
      });
      expect(res).toMatchObject({ predefinedHikeId: null, passagePoints: [] });
    });
  });

  describe('findByHiker', () => {
    it('returns the hikes of the hiker, the latest departure first', async () => {
      client.hike.findMany.mockResolvedValue([row]);
      await expect(repository.findByHiker(7)).resolves.toEqual([hike]);
      expect(client.hike.findMany).toHaveBeenCalledWith({
        where: { hikerId: 7 },
        orderBy: [{ departureAt: 'desc' }, { id: 'desc' }],
      });
    });

    it.each(invalidIds)('returns an empty list for the id %s without querying', async (id) => {
      await expect(repository.findByHiker(id)).resolves.toEqual([]);
      expect(client.hike.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findAllWithHiker', () => {
    const hiker = {
      id: 7,
      fullName: 'Anna Bianchi',
      phone: '+39 333 111 2222',
      emergencyContact: 'Marco Bianchi',
      user: { email: 'anna@example.test' },
    };

    it('reads every hike with the contacts of its hiker, the latest departure first', async () => {
      client.hike.findMany.mockResolvedValue([]);
      await repository.findAllWithHiker();
      expect(client.hike.findMany).toHaveBeenCalledWith({
        include: {
          hiker: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              emergencyContact: true,
              user: { select: { email: true } },
            },
          },
        },
        orderBy: [{ departureAt: 'desc' }, { id: 'desc' }],
      });
    });

    it('maps the hiker with the email of the account', async () => {
      client.hike.findMany.mockResolvedValue([{ ...row, hiker }]);
      await expect(repository.findAllWithHiker()).resolves.toEqual([
        {
          ...hike,
          hiker: {
            id: 7,
            fullName: 'Anna Bianchi',
            email: 'anna@example.test',
            phone: '+39 333 111 2222',
            emergencyContact: 'Marco Bianchi',
          },
        },
      ]);
    });

    it('gives a null email for a temporary hiker without an account', async () => {
      client.hike.findMany.mockResolvedValue([
        { ...row, hiker: { ...hiker, phone: null, emergencyContact: null, user: null } },
      ]);
      const [result] = await repository.findAllWithHiker();
      expect(result.hiker).toEqual({
        id: 7,
        fullName: 'Anna Bianchi',
        email: null,
        phone: null,
        emergencyContact: null,
      });
    });
  });

  describe('findPredefined', () => {
    it('lists the hut hikes by destination and route', async () => {
      const list = [{ id: 2, destination: 'Monte Vettore', route: 'From Foce', passagePoints: [] }];
      client.predefinedHike.findMany.mockResolvedValue(list);
      await expect(repository.findPredefined()).resolves.toEqual(list);
      expect(client.predefinedHike.findMany).toHaveBeenCalledWith({
        select: { id: true, destination: true, route: true, passagePoints: true },
        orderBy: [{ destination: 'asc' }, { route: 'asc' }],
      });
    });
  });
});
