import { Injectable } from '@nestjs/common';
import { MAX_DB_INT } from '@mountain-hut/shared';
import type { PredefinedHike } from '@mountain-hut/shared';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { HikesRepository } from '../application/hikes.repository.port.js';
import type { Hike, LocalMoment, NewHike } from '../domain/hike.js';

interface HikeRow {
  id: number;
  hikerId: number;
  predefinedHikeId: number | null;
  destination: string;
  route: string;
  passagePoints: string[];
  departureAt: Date;
  returnAt: Date;
}

// The columns are TIMESTAMP without time zone holding the hut's local time: Prisma maps them to
// JS Dates in UTC with the same wall clock (as db-time.ts does for the slots).
const toDbMoment = (moment: LocalMoment): Date => new Date(`${moment}:00.000Z`);
const fromDbMoment = (date: Date): LocalMoment => date.toISOString().slice(0, 16);

const toHike = (row: HikeRow): Hike => ({
  id: row.id,
  hikerId: row.hikerId,
  predefinedHikeId: row.predefinedHikeId,
  destination: row.destination,
  route: row.route,
  passagePoints: row.passagePoints,
  departureAt: fromDbMoment(row.departureAt),
  returnAt: fromDbMoment(row.returnAt),
});

// Range of a Postgres INTEGER key: an id outside it cannot exist, and Prisma would fail on it.
const isDbId = (id: number): boolean => Number.isInteger(id) && id >= 1 && id <= MAX_DB_INT;

// Uses the transaction of the current unit of work, or the plain client outside one.
@Injectable()
export class PrismaHikesRepository extends HikesRepository {
  constructor(private readonly context: TransactionContext) {
    super();
  }

  private db() {
    return this.context.client();
  }

  async findHikerIdByUserId(userId: number): Promise<number | null> {
    if (!isDbId(userId)) return null;
    const hiker = await this.db().hiker.findUnique({ where: { userId }, select: { id: true } });
    return hiker?.id ?? null;
  }

  async lockHiker(hikerId: number): Promise<void> {
    await this.db().$queryRaw`SELECT id FROM hikers WHERE id = ${hikerId} FOR UPDATE`;
  }

  async findOverlapping(
    hikerId: number,
    departureAt: LocalMoment,
    returnAt: LocalMoment,
  ): Promise<Hike | null> {
    const row = await this.db().hike.findFirst({
      where: {
        hikerId,
        departureAt: { lt: toDbMoment(returnAt) },
        returnAt: { gt: toDbMoment(departureAt) },
      },
      orderBy: { departureAt: 'asc' },
    });
    return row ? toHike(row) : null;
  }

  async predefinedHikeExists(id: number): Promise<boolean> {
    if (!isDbId(id)) return false;
    return (await this.db().predefinedHike.count({ where: { id } })) > 0;
  }

  async create(hike: NewHike): Promise<Hike> {
    const row = await this.db().hike.create({
      data: {
        hikerId: hike.hikerId,
        predefinedHikeId: hike.predefinedHikeId,
        destination: hike.destination,
        route: hike.route,
        passagePoints: hike.passagePoints,
        departureAt: toDbMoment(hike.departureAt),
        returnAt: toDbMoment(hike.returnAt),
      },
    });
    return toHike(row);
  }

  async findPredefined(): Promise<PredefinedHike[]> {
    return this.db().predefinedHike.findMany({
      select: { id: true, destination: true, route: true, passagePoints: true },
      orderBy: [{ destination: 'asc' }, { route: 'asc' }],
    });
  }
}
