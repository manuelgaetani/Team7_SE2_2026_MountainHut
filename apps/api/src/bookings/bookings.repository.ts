import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { Recipient } from '../notifications/notification.service.js';
import type { BookingConfirmationData } from '../notifications/templates/booking-confirmation.js';
import type { SeatAllocation, TableFreeSeats } from './seat-allocation.js';

type Tx = Prisma.TransactionClient;

export interface NewBooking {
  hikerId: number;
  slotId: number;
  partySize: number;
  requirements: string | null;
}

export interface BookingConfirmation {
  recipient: Recipient;
  booking: BookingConfirmationData;
}

export interface UpcomingSlot {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  startsAt: Date;
  freeSeats: number;
}

export interface StoredBooking {
  id: number;
  slotId: number;
  partySize: number;
  status: 'CONFIRMED' | 'PENDING' | 'REJECTED';
}

// Riceve sempre "tx": la transazione aperta dal service.
@Injectable()
export class BookingsRepository {
  // Slots that have not started yet, with the seats left over all their tables.
  async findUpcomingSlots(tx: Tx, timeZone: string, now: Date): Promise<UpcomingSlot[]> {
    const rows = await tx.$queryRaw<
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
             GREATEST(
               COALESCE((SELECT SUM(st.seats) FROM slot_tables st WHERE st.slot_id = s.id), 0)
               - COALESCE((
                   SELECT SUM(bt.assigned_seats)
                   FROM booking_tables bt
                   JOIN bookings b ON b.id = bt.booking_id
                   JOIN slots s_other ON s_other.id = bt.slot_id
                   WHERE s_other.date = s.date
                     AND s_other.start_time < s.end_time
                     AND s_other.end_time > s.start_time
                     AND b.status IN ('CONFIRMED', 'PENDING')
                 ), 0),
               0
             )::int AS free_seats
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
  async lockSlotAndGetStart(tx: Tx, slotId: number, timeZone: string): Promise<Date | null> {
  const rows = await tx.$queryRaw<{ starts_at: Date }[]>`
    SELECT ((s_target.date + s_target.start_time) AT TIME ZONE ${timeZone}::text) AS starts_at
    FROM slots s_target
    JOIN slots s_other ON s_other.date = s_target.date
      AND s_other.start_time < s_target.end_time
      AND s_other.end_time > s_target.start_time
    WHERE s_target.id = ${slotId}
    FOR UPDATE`;

  return rows[0]?.starts_at ?? null;
}

  // Posti liberi per ogni tavolo: posti del tavolo meno quelli già assegnati
  // alle prenotazioni confermate.
  async findFreeSeatsByTable(tx: Tx, slotId: number): Promise<TableFreeSeats[]> {
    const rows = await tx.$queryRaw<{ table_number: number; free_seats: number }[]>`
      SELECT st.table_number,
             (st.seats - COALESCE(
               SUM(bt.assigned_seats) FILTER (
                 WHERE b.status IN ('CONFIRMED', 'PENDING')
                   AND s_other.date = s_target.date
                   AND s_other.start_time < s_target.end_time
                   AND s_other.end_time > s_target.start_time
               ), 0
             ))::int AS free_seats
      FROM slots s_target
      JOIN slot_tables st ON st.slot_id = s_target.id
      LEFT JOIN booking_tables bt ON bt.table_number = st.table_number
      LEFT JOIN slots s_other ON s_other.id = bt.slot_id
      LEFT JOIN bookings b ON b.id = bt.booking_id
      WHERE s_target.id = ${slotId}
      GROUP BY st.table_number, st.seats
      ORDER BY st.table_number`;
    return rows.map((r) => ({ tableNumber: r.table_number, freeSeats: r.free_seats }));
  }
  // hiker profile of the logged user. null if user doesnt have one
  async findHikerIdByUserId(tx: Tx, userId: number): Promise<number | null> {
    const hiker = await tx.hiker.findUnique({ where: { userId }, select: { id: true } });
    return hiker?.id ?? null;
  }

  // A rejected booking does not stop the hiker from trying again.
  async hasActiveBooking(tx: Tx, hikerId: number, slotId: number): Promise<boolean> {
    const count = await tx.booking.count({
      where: { hikerId, slotId, status: { not: 'REJECTED' } },
    });
    return count > 0;
  }

  async createBooking(tx: Tx, data: NewBooking): Promise<StoredBooking> {
    const booking = await tx.booking.create({ data: { ...data, status: 'PENDING' } });
    return {
      id: booking.id,
      slotId: booking.slotId,
      partySize: booking.partySize,
      status: booking.status,
    };
  }

  // Confirms a booking whose confirmation email has been sent.
  async confirmBooking(client: Tx, bookingId: number): Promise<boolean> {
    const { count } = await client.booking.updateMany({
      where: { id: bookingId, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });
    return count > 0;
  }

  // What the confirmation email needs. null if the booking does not exist.
  async findBookingConfirmation(
    client: Tx,
    bookingId: number,
  ): Promise<BookingConfirmation | null> {
    const row = await client.booking.findUnique({
      where: { id: bookingId },
      select: {
        partySize: true,
        requirements: true,
        hiker: {
          select: { fullName: true, userId: true, user: { select: { email: true } } },
        },
        slot: { select: { date: true, startTime: true, endTime: true } },
      },
    });
    if (!row) return null;
    return {
      recipient: { userId: row.hiker.userId, email: row.hiker.user?.email ?? null },
      booking: {
        bookingId,
        fullName: row.hiker.fullName,
        date: row.slot.date,
        startTime: row.slot.startTime,
        endTime: row.slot.endTime,
        partySize: row.partySize,
        requirements: row.requirements,
      },
    };
  }

  async createBookingTables(
    tx: Tx,
    bookingId: number,
    slotId: number,
    allocation: SeatAllocation[],
  ): Promise<void> {
    await tx.bookingTable.createMany({
      data: allocation.map((a) => ({
        bookingId,
        slotId,
        tableNumber: a.tableNumber,
        assignedSeats: a.assignedSeats,
      })),
    });
  }
}
