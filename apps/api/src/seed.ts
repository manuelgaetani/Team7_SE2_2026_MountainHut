import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from './generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not defined');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Demo accounts, one per role. Their passwords are public: they are only for demos and tests.
const SEED_USERS = [
  {
    email: 'employee@mountainhut.com',
    password: 'Password123!',
    role: 'EMPLOYEE',
    fullName: 'Hut Employee',
    phone: '+39 012 3456789',
  },
  {
    email: 'employee2@mountainhut.com',
    password: 'Password123!',
    role: 'EMPLOYEE',
    fullName: 'Hut Employee Two',
    phone: '+39 012 3456780',
  },
  {
    email: 'warden@mountainhut.com',
    password: 'Password123!',
    role: 'WARDEN',
    fullName: 'Hut Warden',
    phone: '+39 012 3456781',
  },
  {
    email: 'hiker@mountainhut.com',
    password: 'Password123!',
    role: 'HIKER',
    fullName: 'Demo Hiker',
    phone: '+39 333 1234567',
  },
] as const;

const DAYS = 14;
// Three contiguous lunch services and three contiguous dinner services: slots of a day never
// overlap (MH-02, issue #31), they only touch.
const TIMES = [
  ['12:00', '13:00'],
  ['13:00', '14:00'],
  ['14:00', '15:00'],
  ['18:00', '19:00'],
  ['19:00', '20:00'],
  ['20:00', '21:00'],
] as const;
// Tables of every slot: number and seats (24 seats in all).
const TABLES = [
  { tableNumber: 1, seats: 2 },
  { tableNumber: 2, seats: 2 },
  { tableNumber: 3, seats: 4 },
  { tableNumber: 4, seats: 4 },
  { tableNumber: 5, seats: 6 },
  { tableNumber: 6, seats: 6 },
];

// MH-20: the hut's list of hikes the hikers can start from (issue #49). Upserted by destination
// and route, so running the seed again adds nothing twice.
const PREDEFINED_HIKES = [
  {
    destination: 'Monte Vettore',
    route: 'From Forca di Presta via Rifugio Zilioli',
    passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
  },
  {
    destination: 'Lago di Pilato',
    route: 'From Foce along the Valle del Lago',
    passagePoints: ['Foce', 'Le Svolte'],
  },
  {
    destination: 'Cima del Redentore',
    route: 'From Forca di Presta along the ridge past Pizzo del Diavolo',
    passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli', 'Pizzo del Diavolo'],
  },
  {
    destination: 'Monte Vettoretto',
    route: 'From Forca di Presta along the grassy south ridge',
    passagePoints: ['Forca di Presta'],
  },
];

async function seedPredefinedHikes() {
  for (const hike of PREDEFINED_HIKES) {
    await prisma.predefinedHike.upsert({
      where: { destination_route: { destination: hike.destination, route: hike.route } },
      update: { passagePoints: hike.passagePoints },
      create: hike,
    });
  }
  console.log(`Seeded ${PREDEFINED_HIKES.length} predefined hikes`);
}

// Prisma reads the @db.Date and @db.Time columns as Dates in UTC.
const dayAt = (offset: number): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset));
};
const timeOf = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00Z`);

// Deletes every slot with its tables and bookings, so no older (possibly overlapping) slot is
// left. Notifications stay, without their booking.
async function clearSlots() {
  await prisma.$transaction([
    prisma.bookingTable.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.slotTable.deleteMany(),
    prisma.slot.deleteMany(),
  ]);
  console.log('Deleted the existing slots, tables and bookings');
}

// Creates the account, or resets its password and role if it exists, with its profile.
async function seedUser(seed: (typeof SEED_USERS)[number]) {
  const passwordHash = await bcrypt.hash(seed.password, 10);
  const user = await prisma.user.upsert({
    where: { email: seed.email },
    update: { password: passwordHash, role: seed.role },
    create: { email: seed.email, password: passwordHash, role: seed.role },
  });

  await prisma.hiker.upsert({
    where: { userId: user.id },
    update: { fullName: seed.fullName, phone: seed.phone },
    create: { userId: user.id, fullName: seed.fullName, phone: seed.phone },
  });

  console.log(`Seeded ${seed.role.toLowerCase()} user: ${seed.email} (password: ${seed.password})`);
}

// With --on-start (how the Docker image runs it at every start) the seed runs only when
// SEED_DEMO_DATA is "true" and the database has no users: a new installation of a release gets
// the demo data, an existing one keeps its own, and the development and CI stacks stay empty.
async function isEmpty(): Promise<boolean> {
  return (await prisma.user.count()) === 0;
}

async function main() {
  if (process.argv.includes('--on-start')) {
    if (process.env.SEED_DEMO_DATA !== 'true') return;
    if (!(await isEmpty())) {
      console.log('The database already has users: demo data not seeded');
      return;
    }
  }

  for (const user of SEED_USERS) {
    await seedUser(user);
  }

  await seedPredefinedHikes();

  await clearSlots();
  for (let day = 0; day < DAYS; day++) {
    const date = dayAt(day);
    for (const [start, end] of TIMES) {
      await prisma.slot.create({
        data: {
          date,
          startTime: timeOf(start),
          endTime: timeOf(end),
          tables: { create: TABLES },
        },
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
