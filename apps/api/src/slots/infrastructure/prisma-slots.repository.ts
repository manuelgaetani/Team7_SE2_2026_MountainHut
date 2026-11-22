import { Injectable } from '@nestjs/common';
import { MAX_DB_INT } from '@mountain-hut/shared';
import type { SlotTable } from '@mountain-hut/shared';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { isUniqueViolation } from '../../infrastructure/prisma/prisma-errors.js';
import { fromDbDate, fromDbTime, toDbDate, toDbTime } from '../../infrastructure/prisma/db-time.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { SlotsRepository } from '../application/slots.repository.port.js';
import type { NewSlot, Slot } from '../domain/slot.js';

interface SlotRow {
  id: number;
  date: Date;
  startTime: Date;
  endTime: Date;
  tables: SlotTable[];
}

const withTables = {
  tables: { select: { tableNumber: true, seats: true }, orderBy: { tableNumber: 'asc' } },
} as const;

const toSlot = (row: SlotRow): Slot => ({
  id: row.id,
  date: fromDbDate(row.date),
  startTime: fromDbTime(row.startTime),
  endTime: fromDbTime(row.endTime),
  tables: row.tables,
});

// Range of a Postgres INTEGER key: an id outside it cannot exist, and Prisma would fail on it.
const isDbId = (id: number): boolean => Number.isInteger(id) && id >= 1 && id <= MAX_DB_INT;

// Uses the transaction of the current unit of work, or the plain client outside one.
@Injectable()
export class PrismaSlotsRepository extends SlotsRepository {
  constructor(private readonly context: TransactionContext) {
    super();
  }

  private db() {
    return this.context.client();
  }

  async findById(id: number): Promise<Slot | null> {
    if (!isDbId(id)) return null;
    const row = await this.db().slot.findUnique({ where: { id }, include: withTables });
    return row ? toSlot(row) : null;
  }

  async findByDate(date: string): Promise<Slot[]> {
    const rows = await this.db().slot.findMany({
      where: { date: toDbDate(date) },
      include: withTables,
      orderBy: { startTime: 'asc' },
    });
    return rows.map(toSlot);
  }

  async lock(id: number): Promise<boolean> {
    if (!isDbId(id)) return false;
    const rows = await this.db().$queryRaw<{ id: number }[]>`
      SELECT id FROM slots WHERE id = ${id} FOR UPDATE`;
    return rows.length > 0;
  }

  // An advisory lock works even when the day has no slots yet. Key: 'slots-day:YYYY-MM-DD'.
  async lockDay(date: string): Promise<void> {
    await this.db()
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('slots-day:' || ${toDbDate(date)}::date::text, 0))`;
  }

  async lockBetween(from: string, to: string): Promise<void> {
    await this.db().$queryRaw`
      SELECT id FROM slots
      WHERE date BETWEEN ${toDbDate(from)}::date AND ${toDbDate(to)}::date
      ORDER BY id
      FOR UPDATE`;
  }

  async findBetween(from: string, to: string): Promise<Slot[]> {
    const rows = await this.db().slot.findMany({
      where: { date: { gte: toDbDate(from), lte: toDbDate(to) } },
      include: withTables,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map(toSlot);
  }

  async findReservedDates(from: string, to: string): Promise<string[]> {
    const slots = await this.db().slot.findMany({
      where: {
        date: { gte: toDbDate(from), lte: toDbDate(to) },
        bookings: { some: { status: { in: ['PENDING', 'CONFIRMED'] } } },
      },
      select: { date: true },
      distinct: ['date'],
      orderBy: { date: 'asc' },
    });
    return slots.map((s) => fromDbDate(s.date));
  }

  async deleteSlots(ids: number[]): Promise<void> {
    const slotId = { in: ids };
    const db = this.db();
    await db.bookingTable.deleteMany({ where: { slotId } });
    await db.booking.deleteMany({ where: { slotId } });
    await db.slotTable.deleteMany({ where: { slotId } });
    await db.slot.deleteMany({ where: { id: slotId } });
  }

  async findTables(slotId: number): Promise<SlotTable[]> {
    return this.db().slotTable.findMany({
      where: { slotId },
      select: { tableNumber: true, seats: true },
      orderBy: { tableNumber: 'asc' },
    });
  }

  async create(slot: NewSlot): Promise<number> {
    try {
      const created = await this.db().slot.create({
        data: {
          date: toDbDate(slot.date),
          startTime: toDbTime(slot.startTime),
          endTime: toDbTime(slot.endTime),
        },
        select: { id: true },
      });
      return created.id;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError(
          'CONFLICT',
          'A slot with the same date, start and end already exists',
        );
      }
      throw e;
    }
  }

  async createTables(slotId: number, tables: SlotTable[]): Promise<void> {
    await this.db().slotTable.createMany({ data: tables.map((t) => ({ slotId, ...t })) });
  }
}
