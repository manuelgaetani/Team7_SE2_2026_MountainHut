import { Injectable } from '@nestjs/common';
import { MAX_DB_INT } from '@mountain-hut/shared';
import { isForeignKeyViolation } from '../../infrastructure/prisma/prisma-errors.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { MenusRepository } from '../application/menus.repository.port.js';
import type { StoredMenu, StoredMenuWithSlot } from '../application/menus.repository.port.js';

// Range of a Postgres INTEGER key: an id outside it cannot exist, and Prisma would fail on it.
const isDbId = (id: number): boolean => Number.isInteger(id) && id >= 1 && id <= MAX_DB_INT;

const stored = { slotId: true, text: true, updatedAt: true } as const;

// Uses the transaction of the current unit of work, or the plain client outside one.
@Injectable()
export class PrismaMenusRepository extends MenusRepository {
  constructor(private readonly context: TransactionContext) {
    super();
  }

  private db() {
    return this.context.client();
  }

  // One statement: two requests for the same slot cannot create two menus, the last one wins.
  async save(slotId: number, text: string): Promise<StoredMenu | null> {
    if (!isDbId(slotId)) return null;
    try {
      return await this.db().menu.upsert({
        where: { slotId },
        create: { slotId, text },
        update: { text },
        select: stored,
      });
    } catch (e) {
      // The slot does not exist, or was deleted meanwhile.
      if (isForeignKeyViolation(e)) return null;
      throw e;
    }
  }

  async findBySlot(slotId: number): Promise<StoredMenu | null> {
    if (!isDbId(slotId)) return null;
    return this.db().menu.findUnique({ where: { slotId }, select: stored });
  }

  async slotExists(slotId: number): Promise<boolean> {
    if (!isDbId(slotId)) return false;
    return (await this.db().slot.count({ where: { id: slotId } })) > 0;
  }

  async findSlotStart(slotId: number, timeZone: string): Promise<Date | null> {
    if (!isDbId(slotId)) return null;
    const rows = await this.db().$queryRaw<{ starts_at: Date }[]>`
      SELECT ((s.date + s.start_time) AT TIME ZONE ${timeZone}::text) AS starts_at
      FROM slots s
      WHERE s.id = ${slotId}`;
    return rows[0]?.starts_at ?? null;
  }

  async delete(slotId: number): Promise<boolean> {
    if (!isDbId(slotId)) return false;
    const { count } = await this.db().menu.deleteMany({ where: { slotId } });
    return count > 0;
  }

  async findPrevious(limit: number): Promise<StoredMenuWithSlot[]> {
    const rows = await this.db().$queryRaw<
      {
        slot_id: number;
        text: string;
        updated_at: Date;
        date: string;
        start_time: string;
        end_time: string;
      }[]
    >`
      SELECT * FROM (
        -- The same text used for several slots counts once, with its latest slot.
        SELECT DISTINCT ON (m.text)
               m.slot_id,
               m.text,
               m.updated_at,
               to_char(s.date, 'YYYY-MM-DD') AS date,
               to_char(s.start_time, 'HH24:MI') AS start_time,
               to_char(s.end_time, 'HH24:MI') AS end_time
        FROM menus m
        JOIN slots s ON s.id = m.slot_id
        ORDER BY m.text, s.date DESC, s.start_time DESC, m.slot_id DESC
      ) latest
      ORDER BY date DESC, start_time DESC, slot_id DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      slotId: r.slot_id,
      text: r.text,
      updatedAt: r.updated_at,
      date: r.date,
      startTime: r.start_time,
      endTime: r.end_time,
    }));
  }
}
