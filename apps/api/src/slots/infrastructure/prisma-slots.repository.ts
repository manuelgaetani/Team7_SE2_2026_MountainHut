import { Injectable } from '@nestjs/common';
import { MAX_DB_INT } from '@mountain-hut/shared';
import type { SlotTable } from '@mountain-hut/shared';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { isUniqueViolation } from '../../infrastructure/prisma/prisma-errors.js';
import { fromDbDate, fromDbTime, toDbDate, toDbTime } from '../../infrastructure/prisma/db-time.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { SlotsRepository } from '../application/slots.repository.port.js';
import type { FloorAllocation } from '../domain/floor-plan.js';
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

  async findFloorAllocations(slotId: number): Promise<FloorAllocation[]> {
    if (!isDbId(slotId)) return [];
    const rows = await this.db().$queryRaw<
      {
        booking_id: number;
        full_name: string;
        party_size: number;
        status: 'CONFIRMED' | 'PENDING';
        start_time: string;
        end_time: string;
        table_number: number;
        assigned_seats: number;
      }[]
    >`
      SELECT b.id AS booking_id,
             h.full_name,
             b.party_size,
             b.status,
             to_char(s_other.start_time, 'HH24:MI') AS start_time,
             to_char(s_other.end_time, 'HH24:MI') AS end_time,
             bt.table_number,
             bt.assigned_seats
      FROM slots s_target
      JOIN slots s_other
        ON s_other.date = s_target.date
       AND s_other.start_time < s_target.end_time
       AND s_other.end_time > s_target.start_time
      JOIN booking_tables bt ON bt.slot_id = s_other.id
      JOIN bookings b ON b.id = bt.booking_id
      JOIN hikers h ON h.id = b.hiker_id
      JOIN slot_tables st
        ON st.slot_id = s_target.id
       AND st.table_number = bt.table_number
      WHERE s_target.id = ${slotId}
        AND b.status IN ('CONFIRMED', 'PENDING')
      ORDER BY b.id, bt.table_number`;

    return rows.map((r) => ({
      bookingId: r.booking_id,
      fullName: r.full_name,
      partySize: r.party_size,
      status: r.status,
      startTime: r.start_time,
      endTime: r.end_time,
      tableNumber: r.table_number,
      assignedSeats: r.assigned_seats,
    }));
  }
}
