import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { SeatAllocation, TableFreeSeats } from './seat-allocation.js';

type Tx = Prisma.TransactionClient;

export interface NewBooking {
  hikerId: number;
  slotId: number;
  partySize: number;
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
  // Blocca la riga dello slot (le altre prenotazioni dello stesso slot aspettano)
  // e restituisce quando lo slot inizia. null se lo slot non esiste.
  async lockSlotAndGetStart(tx: Tx, slotId: number, timeZone: string): Promise<Date | null> {
    const rows = await tx.$queryRaw<{ starts_at: Date }[]>`
      SELECT ((date + start_time) AT TIME ZONE ${timeZone}::text) AS starts_at
      FROM slots
      WHERE id = ${slotId}
      FOR UPDATE`;
    return rows[0]?.starts_at ?? null;
  }

  // Posti liberi per ogni tavolo: posti del tavolo meno quelli già assegnati
  // alle prenotazioni confermate.
  async findFreeSeatsByTable(tx: Tx, slotId: number): Promise<TableFreeSeats[]> {
    const rows = await tx.$queryRaw<{ table_number: number; free_seats: number }[]>`
      SELECT st.table_number,
             (st.seats - COALESCE(SUM(bt.assigned_seats) FILTER (WHERE b.status = 'CONFIRMED'), 0))::int
               AS free_seats
      FROM slot_tables st
      LEFT JOIN booking_tables bt
        ON bt.slot_id = st.slot_id AND bt.table_number = st.table_number
      LEFT JOIN bookings b ON b.id = bt.booking_id
      WHERE st.slot_id = ${slotId}
      GROUP BY st.table_number, st.seats
      ORDER BY st.table_number`;
    return rows.map((r) => ({ tableNumber: r.table_number, freeSeats: r.free_seats }));
  }
  // hiker profile of the logged user. null if user doesnt have one
  async findHikerIdByUserId(tx: Tx, userId: number): Promise<number | null> {
    const hiker = await tx.hiker.findUnique({ where: { userId }, select: { id: true } });
    return hiker?.id ?? null;
  }

  async createConfirmedBooking(tx: Tx, data: NewBooking): Promise<StoredBooking> {
    const booking = await tx.booking.create({ data: { ...data, status: 'CONFIRMED' } });
    return {
      id: booking.id,
      slotId: booking.slotId,
      partySize: booking.partySize,
      status: booking.status,
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
