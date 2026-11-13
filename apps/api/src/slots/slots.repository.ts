import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

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

  // Locks a day until the end of the transaction, so two requests cannot change the slots of the
  // same day at the same time. An advisory lock also works on a day that has no slots yet.
  // Same key as the MH-02 overlap check: 'slots-day:YYYY-MM-DD'.
  async lockDay(tx: Tx, date: Date): Promise<void> {
    const day = date.toISOString().slice(0, 10);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('slots-day:' || ${day}, 0))`;
  }

  // Slots from one date to another, both included, by date and start time, with their tables.
  async findBetween(tx: Tx, from: Date, to: Date): Promise<SlotRow[]> {
    return tx.slot.findMany({
      where: { date: { gte: from, lte: to } },
      include: withTables,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  // Days, between two dates both included, with a slot that has reservations: bookings that
  // take seats (pending or confirmed).
  async findReservedDates(tx: Tx, from: Date, to: Date): Promise<Date[]> {
    const slots = await tx.slot.findMany({
      where: {
        date: { gte: from, lte: to },
        bookings: { some: { status: { in: ['PENDING', 'CONFIRMED'] } } },
      },
      select: { date: true },
      distinct: ['date'],
      orderBy: { date: 'asc' },
    });
    return slots.map((s) => s.date);
  }

  // Deletes slots with their tables. Bookings left on them take no seats (the caller checks
  // there are no reservations) and are deleted too, with their table assignments.
  async deleteSlots(tx: Tx, ids: number[]): Promise<void> {
    const slotId = { in: ids };
    await tx.bookingTable.deleteMany({ where: { slotId } });
    await tx.booking.deleteMany({ where: { slotId } });
    await tx.slotTable.deleteMany({ where: { slotId } });
    await tx.slot.deleteMany({ where: { id: slotId } });
  }

  async create(tx: Tx, data: NewSlot): Promise<number> {
    const slot = await tx.slot.create({ data, select: { id: true } });
    return slot.id;
  }

  async createTables(tx: Tx, slotId: number, tables: TableRow[]): Promise<void> {
    await tx.slotTable.createMany({ data: tables.map((t) => ({ slotId, ...t })) });
  }
}
