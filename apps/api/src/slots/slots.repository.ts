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

  async create(tx: Tx, data: NewSlot): Promise<number> {
    const slot = await tx.slot.create({ data, select: { id: true } });
    return slot.id;
  }

  async createTables(tx: Tx, slotId: number, tables: TableRow[]): Promise<void> {
    await tx.slotTable.createMany({ data: tables.map((t) => ({ slotId, ...t })) });
  }
}
