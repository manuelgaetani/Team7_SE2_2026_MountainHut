import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { FloorAllocation } from './floor-plan.js';

type Tx = Prisma.TransactionClient;

export interface TableRow {
  tableNumber: number;
  seats: number;
}

export interface SlotRow {
  id: number;
  date: Date;
  startTime: Date;
  endTime: Date;
  tables: TableRow[];
}

export interface NewSlot {
  date: Date;
  startTime: Date;
  endTime: Date;
}

const withTables = {
  tables: { select: { tableNumber: true, seats: true }, orderBy: { tableNumber: 'asc' } },
} as const;

// Range of a Postgres INTEGER key: an id outside it cannot exist, and Prisma would fail on it.
const isDbId = (id: number): boolean => Number.isInteger(id) && id >= 1 && id <= 2_147_483_647;

// Always receives "tx": the transaction opened by the service, or the plain client for reads.
@Injectable()
export class SlotsRepository {
  async findById(tx: Tx, id: number): Promise<SlotRow | null> {
    if (!isDbId(id)) return null;
    return tx.slot.findUnique({ where: { id }, include: withTables });
  }

  async findByDate(tx: Tx, date: Date): Promise<SlotRow[]> {
    return tx.slot.findMany({
      where: { date },
      include: withTables,
      orderBy: { startTime: 'asc' },
    });
  }

  // Locks the slot row until the end of the transaction, so two requests cannot define its
  // tables at the same time. False if the slot does not exist.
  async lock(tx: Tx, id: number): Promise<boolean> {
    if (!isDbId(id)) return false;
    const rows = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM slots WHERE id = ${id} FOR UPDATE`;
    return rows.length > 0;
  }

  async findTables(tx: Tx, slotId: number): Promise<TableRow[]> {
    return tx.slotTable.findMany({
      where: { slotId },
      select: { tableNumber: true, seats: true },
      orderBy: { tableNumber: 'asc' },
    });
  }

  async create(tx: Tx, data: NewSlot): Promise<number> {
    const slot = await tx.slot.create({ data, select: { id: true } });
    return slot.id;
  }

  async createTables(tx: Tx, slotId: number, tables: TableRow[]): Promise<void> {
    await tx.slotTable.createMany({ data: tables.map((t) => ({ slotId, ...t })) });
  }

  async findFloorAllocations(tx: Tx, slotId: number): Promise<FloorAllocation[]> {
    if (!isDbId(slotId)) return [];
    const rows = await tx.$queryRaw<
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
