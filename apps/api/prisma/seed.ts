import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not defined');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const SEED_EMPLOYEES = [
  {
    email: 'employee@mountainhut.com',
    password: 'Password123!',
    fullName: 'Hut Employee',
    phone: '+39 012 3456789',
  },
  {
    email: 'employee2@mountainhut.com',
    password: 'Password123!',
    fullName: 'Hut Employee Two',
    phone: '+39 012 3456780',
  },
];

const DAYS = 14;
// Pranzo: quattro turni da un'ora, a partire dalle 12:00 ogni mezz'ora.
const TIMES = [
  ['12:00', '13:00'],
  ['12:30', '13:30'],
  ['13:00', '14:00'],
  ['13:30', '14:30'],
] as const;
// Tavoli di ogni turno: numero e posti (24 posti in totale).
const TABLES = [
  { tableNumber: 1, seats: 2 },
  { tableNumber: 2, seats: 2 },
  { tableNumber: 3, seats: 4 },
  { tableNumber: 4, seats: 4 },
  { tableNumber: 5, seats: 6 },
  { tableNumber: 6, seats: 6 },
];

// Le colonne @db.Date e @db.Time sono lette da Prisma come Date in UTC.
const dayAt = (offset: number): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset));
};
const timeOf = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00Z`);

async function seedEmployee(seed: (typeof SEED_EMPLOYEES)[number]) {
  const passwordHash = await bcrypt.hash(seed.password, 10);
  const employee = await prisma.user.upsert({
    where: { email: seed.email },
    update: {
      password: passwordHash,
      role: 'EMPLOYEE',
    },
    create: {
      email: seed.email,
      password: passwordHash,
      role: 'EMPLOYEE',
      hiker: {
        create: {
          fullName: seed.fullName,
          phone: seed.phone,
        },
      },
    },
  });

  await prisma.hiker.upsert({
    where: { userId: employee.id },
    update: {
      fullName: seed.fullName,
      phone: seed.phone,
    },
    create: {
      userId: employee.id,
      fullName: seed.fullName,
      phone: seed.phone,
    },
  });

  console.log(`Seeded employee user: ${seed.email} (password: ${seed.password})`);
}

async function main() {
  for (const employee of SEED_EMPLOYEES) {
    await seedEmployee(employee);
  }

  for (let day = 0; day < DAYS; day++) {
    const date = dayAt(day);
    for (const [start, end] of TIMES) {
      const slot = await prisma.slot.upsert({
        where: {
          date_startTime_endTime: { date, startTime: timeOf(start), endTime: timeOf(end) },
        },
        update: {},
        create: { date, startTime: timeOf(start), endTime: timeOf(end) },
      });
      await prisma.slotTable.createMany({
        data: TABLES.map((t) => ({ slotId: slot.id, ...t })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`Seeded ${DAYS * TIMES.length} slots with ${TABLES.length} tables each`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
