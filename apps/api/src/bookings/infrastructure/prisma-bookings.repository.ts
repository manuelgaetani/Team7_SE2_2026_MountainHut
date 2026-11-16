import { Injectable } from '@nestjs/common';
import { MAX_DB_INT } from '@mountain-hut/shared';
import type { CancelledBooking } from '@mountain-hut/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { BookingsRepository } from '../application/bookings.repository.port.js';
import type {
  BookingToCancel,
  NewBooking,
  StoredBooking,
  UpcomingSlot,
} from '../application/bookings.repository.port.js';
import type { SeatAllocation, TableFreeSeats } from '../domain/seat-allocation.js';

// Seats already assigned on a table, over every slot of the same day that overlaps the given one.
// slotAlias is the alias of the slot being measured; the table number is a SQL expression.
const bookedSeatsOnTable = (tableNumberSql: Prisma.Sql, slotAlias: Prisma.Sql) => Prisma.sql`
  SELECT SUM(bt.assigned_seats)
  FROM booking_tables bt
  JOIN bookings b ON b.id = bt.booking_id
  JOIN slots s_other ON s_other.id = bt.slot_id
  WHERE bt.table_number = ${tableNumberSql}
    AND b.status IN ('CONFIRMED', 'PENDING')
    AND s_other.date = ${slotAlias}.date
    AND s_other.start_time < ${slotAlias}.end_time
    AND s_other.end_time > ${slotAlias}.start_time`;

// Uses the transaction of the current unit of work, or the plain client outside one.
@Injectable()
export class PrismaBookingsRepository extends BookingsRepository {
  constructor(private readonly context: TransactionContext) {
    super();
  }

  private db() {
    return this.context.client();
  }

  // Slots that have not started yet, with the seats left over all their tables.
  async findUpcomingSlots(timeZone: string, now: Date): Promise<UpcomingSlot[]> {
    const rows = await this.db().$queryRaw<
      {
        id: number;
        date: string;
        start_time: string;
        end_time: string;
        starts_at: Date;
        free_seats: number;
      }[]
    >`
      SELECT s.id,
             to_char(s.date, 'YYYY-MM-DD') AS date,
             to_char(s.start_time, 'HH24:MI') AS start_time,
             to_char(s.end_time, 'HH24:MI') AS end_time,
             ((s.date + s.start_time) AT TIME ZONE ${timeZone}::text) AS starts_at,
             COALESCE((
               SELECT SUM(GREATEST(st.seats - COALESCE((
                 ${bookedSeatsOnTable(Prisma.sql`st.table_number`, Prisma.sql`s`)}
               ), 0), 0))
               FROM slot_tables st
               WHERE st.slot_id = s.id
             ), 0)::int AS free_seats
      FROM slots s
      WHERE ((s.date + s.start_time) AT TIME ZONE ${timeZone}::text) > ${now}
      ORDER BY starts_at, s.id`;

    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      startTime: r.start_time,
      endTime: r.end_time,
      startsAt: r.starts_at,
      freeSeats: r.free_seats,
    }));
  }

  // Blocca la riga dello slot (le altre prenotazioni dello stesso slot aspettano)
  // e restituisce quando lo slot inizia. null se lo slot non esiste.
  async lockSlotAndGetStart(slotId: number, timeZone: string): Promise<Date | null> {
    const rows = await this.db().$queryRaw<{ starts_at: Date }[]>`
      SELECT ((s_target.date + s_target.start_time) AT TIME ZONE ${timeZone}::text) AS starts_at
      FROM slots s_target
      JOIN slots s_other
        ON s_other.date = s_target.date
       AND s_other.start_time < s_target.end_time
       AND s_other.end_time > s_target.start_time
       AND (
         s_other.id = s_target.id
         OR EXISTS (
           SELECT 1
           FROM slot_tables t_target
           JOIN slot_tables t_other ON t_other.table_number = t_target.table_number
           WHERE t_target.slot_id = s_target.id
             AND t_other.slot_id = s_other.id
         )
       )
      WHERE s_target.id = ${slotId}
      ORDER BY s_other.id
      FOR UPDATE OF s_other`;

    return rows[0]?.starts_at ?? null;
  }

  // Posti liberi per ogni tavolo: posti del tavolo meno quelli già assegnati
  // alle prenotazioni confermate.
  async findFreeSeatsByTable(slotId: number): Promise<TableFreeSeats[]> {
    const rows = await this.db().$queryRaw<{ table_number: number; free_seats: number }[]>`
      SELECT st.table_number,
             (st.seats - COALESCE((
               ${bookedSeatsOnTable(Prisma.sql`st.table_number`, Prisma.sql`s_target`)}
             ), 0))::int AS free_seats
      FROM slots s_target
      JOIN slot_tables st ON st.slot_id = s_target.id
      WHERE s_target.id = ${slotId}
      ORDER BY st.table_number`;
    return rows.map((r) => ({ tableNumber: r.table_number, freeSeats: r.free_seats }));
  }
  // hiker profile of the logged user. null if user doesnt have one
  async findHikerIdByUserId(userId: number): Promise<number | null> {
    const hiker = await this.db().hiker.findUnique({ where: { userId }, select: { id: true } });
    return hiker?.id ?? null;
  }

  // A rejected or cancelled booking does not stop the hiker from trying again.
  async hasActiveBooking(hikerId: number, slotId: number): Promise<boolean> {
    const count = await this.db().booking.count({
      where: { hikerId, slotId, status: { notIn: ['REJECTED', 'CANCELLED'] } },
    });
    return count > 0;
  }

  async createBooking(data: NewBooking): Promise<StoredBooking> {
    const booking = await this.db().booking.create({ data: { ...data, status: 'PENDING' } });
    return {
      id: booking.id,
      slotId: booking.slotId,
      partySize: booking.partySize,
      // Always PENDING: it has just been created as such.
      status: 'PENDING',
    };
  }

  // Confirms a booking whose confirmation email has been sent.
  async confirmBooking(bookingId: number): Promise<boolean> {
    const { count } = await this.db().booking.updateMany({
      where: { id: bookingId, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });
    return count > 0;
  }

  async createBookingTables(
    bookingId: number,
    slotId: number,
    allocation: SeatAllocation[],
  ): Promise<void> {
    await this.db().bookingTable.createMany({
      data: allocation.map((a) => ({
        bookingId,
        slotId,
        tableNumber: a.tableNumber,
        assignedSeats: a.assignedSeats,
      })),
    });
  }

  // Locks the booking row: a concurrent cancellation of the same booking waits.
  // null if the booking does not exist.
  async lockBooking(bookingId: number): Promise<BookingToCancel | null> {
    if (!Number.isInteger(bookingId) || bookingId <= 0 || bookingId > MAX_DB_INT) return null;
    const rows = await this.db().$queryRaw<
      { hiker_id: number; status: BookingToCancel['status'] }[]
    >`
      SELECT hiker_id, status::text AS status FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
    const row = rows[0];
    return row ? { hikerId: row.hiker_id, status: row.status } : null;
  }

  // The booking_tables rows stay as history: only CONFIRMED and PENDING bookings occupy seats.
  async cancelBooking(bookingId: number): Promise<CancelledBooking> {
    const booking = await this.db().booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    });
    return {
      id: booking.id,
      slotId: booking.slotId,
      partySize: booking.partySize,
      status: 'CANCELLED',
    };
  }
}
