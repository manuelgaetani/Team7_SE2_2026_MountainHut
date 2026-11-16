import { Injectable } from '@nestjs/common';
import { MAX_DB_INT } from '@mountain-hut/shared';
import type { SlotTable } from '@mountain-hut/shared';
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

  async findTables(slotId: number): Promise<SlotTable[]> {
    return this.db().slotTable.findMany({
      where: { slotId },
      select: { tableNumber: true, seats: true },
      orderBy: { tableNumber: 'asc' },
    });
  }

  async create(slot: NewSlot): Promise<number> {
    const created = await this.db().slot.create({
      data: {
        date: toDbDate(slot.date),
        startTime: toDbTime(slot.startTime),
        endTime: toDbTime(slot.endTime),
      },
      select: { id: true },
    });
    return created.id;
  }

  async createTables(slotId: number, tables: SlotTable[]): Promise<void> {
    await this.db().slotTable.createMany({ data: tables.map((t) => ({ slotId, ...t })) });
  }
}
