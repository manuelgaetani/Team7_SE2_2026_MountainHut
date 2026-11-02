import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { assertTestDatabase } from './test-database.js';

type BookingStatus = 'CONFIRMED' | 'PENDING' | 'REJECTED';

// Empties every table, so each test starts from a known state.
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  await prisma.$executeRaw`
    TRUNCATE booking_tables, bookings, slot_tables, slots, refresh_tokens, hikers, users
    RESTART IDENTITY CASCADE`;
}

// A user with a hiker profile. Returns both ids.
export async function createHiker(
  prisma: PrismaService,
  email: string,
): Promise<{ userId: number; hikerId: number }> {
  const user = await prisma.user.create({
    data: {
      email,
      password: 'not-used',
      hiker: { create: { fullName: 'Test', phone: '3331234567' } },
    },
    include: { hiker: true },
  });
  return { userId: user.id, hikerId: user.hiker!.id };
}

// A slot on a hut-local date and times, e.g. ('2031-07-01', '19:00', '21:00'), with one table
// per number of seats (tables 1, 2, ...).
export async function createSlot(
  prisma: PrismaService,
  date: string,
  startTime: string,
  endTime: string,
  seats: number[],
): Promise<number> {
  const slot = await prisma.slot.create({
    data: {
      date: new Date(`${date}T00:00:00.000Z`),
      startTime: new Date(`1970-01-01T${startTime}:00.000Z`),
      endTime: new Date(`1970-01-01T${endTime}:00.000Z`),
      tables: { create: seats.map((s, i) => ({ tableNumber: i + 1, seats: s })) },
    },
  });
  return slot.id;
}

// A booking with its table assignments, written directly, e.g. to set up a rejected booking.
export async function createBooking(
  prisma: PrismaService,
  hikerId: number,
  slotId: number,
  status: BookingStatus,
  tables: { tableNumber: number; assignedSeats: number }[],
): Promise<number> {
  const partySize = tables.reduce((sum, t) => sum + t.assignedSeats, 0);
  const booking = await prisma.booking.create({ data: { hikerId, slotId, partySize, status } });
  await prisma.bookingTable.createMany({
    data: tables.map((t) => ({ bookingId: booking.id, slotId, ...t })),
  });
  return booking.id;
}
