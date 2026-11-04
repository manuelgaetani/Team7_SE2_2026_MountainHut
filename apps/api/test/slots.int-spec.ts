import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SlotsRepository } from '../src/slots/slots.repository.js';
import { SlotsService } from '../src/slots/slots.service.js';
import { resetDatabase } from './integration/database.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Slots with PostgreSQL (integration) - MH-02', () => {
  const prisma = new PrismaService();
  const repo = new SlotsRepository();
  const service = new SlotsService(prisma, repo);

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('SlotsRepository against real PostgreSQL', () => {
    it('creates a slot and retrieves it by id with its tables ordered by tableNumber', async () => {
      const slotId = await prisma.$transaction(async (tx) => {
        const id = await repo.create(tx, {
          date: new Date('2032-06-15T00:00:00.000Z'),
          startTime: new Date('1970-01-01T12:00:00.000Z'),
          endTime: new Date('1970-01-01T14:00:00.000Z'),
        });
        await repo.createTables(tx, id, [
          { tableNumber: 3, seats: 6 },
          { tableNumber: 1, seats: 2 },
          { tableNumber: 2, seats: 4 },
        ]);
        return id;
      });

      const slot = await repo.findById(prisma, slotId);
      expect(slot).not.toBeNull();
      expect(slot!.id).toBe(slotId);
      expect(slot!.tables).toEqual([
        { tableNumber: 1, seats: 2 },
        { tableNumber: 2, seats: 4 },
        { tableNumber: 3, seats: 6 },
      ]);
    });

    it('returns null when slot does not exist or id is out of integer range', async () => {
      await expect(repo.findById(prisma, 999_999)).resolves.toBeNull();
      await expect(repo.findById(prisma, -1)).resolves.toBeNull();
      await expect(repo.findById(prisma, 2_147_483_648)).resolves.toBeNull();
    });

    it('findTables returns empty array for a slot without tables', async () => {
      const slotId = await repo.create(prisma, {
        date: new Date('2032-06-15T00:00:00.000Z'),
        startTime: new Date('1970-01-01T12:00:00.000Z'),
        endTime: new Date('1970-01-01T14:00:00.000Z'),
      });
      await expect(repo.findTables(prisma, slotId)).resolves.toEqual([]);
    });

    it('enforces table uniqueness and positive seat count at the database level', async () => {
      const slotId = await repo.create(prisma, {
        date: new Date('2032-06-15T00:00:00.000Z'),
        startTime: new Date('1970-01-01T12:00:00.000Z'),
        endTime: new Date('1970-01-01T14:00:00.000Z'),
      });

      // Duplicate table number in the same slot violates primary key (slot_id, table_number)
      await repo.createTables(prisma, slotId, [{ tableNumber: 1, seats: 4 }]);
      await expect(
        repo.createTables(prisma, slotId, [{ tableNumber: 1, seats: 2 }]),
      ).rejects.toThrow();

      // Non-positive seats violates check constraint
      await expect(
        repo.createTables(prisma, slotId, [{ tableNumber: 2, seats: 0 }]),
      ).rejects.toThrow();
    });

    it('locks slot row for update across concurrent transactions', async () => {
      const slotId = await repo.create(prisma, {
        date: new Date('2032-06-15T00:00:00.000Z'),
        startTime: new Date('1970-01-01T12:00:00.000Z'),
        endTime: new Date('1970-01-01T14:00:00.000Z'),
      });

      const events: string[] = [];
      let firstHasLock!: () => void;
      const firstLocked = new Promise<void>((resolve) => (firstHasLock = resolve));

      const tx1 = prisma.$transaction(async (tx) => {
        expect(await repo.lock(tx, slotId)).toBe(true);
        events.push('tx1 locked');
        firstHasLock();
        await sleep(250);
        events.push('tx1 done');
      });

      await firstLocked;

      const tx2 = prisma.$transaction(async (tx) => {
        expect(await repo.lock(tx, slotId)).toBe(true);
        events.push('tx2 locked');
      });

      await Promise.all([tx1, tx2]);
      expect(events).toEqual(['tx1 locked', 'tx1 done', 'tx2 locked']);
    });
  });

  describe('Flexible starting time and duration (Clarification 1)', () => {
    it('creates slots with completely flexible start times and durations', async () => {
      // 30 minutes duration
      const shortSlot = await service.create({
        date: '2033-05-10',
        startTime: '12:00',
        endTime: '12:30',
        tables: [{ tableNumber: 1, seats: 4 }],
      });
      expect(shortSlot.startTime).toBe('12:00');
      expect(shortSlot.endTime).toBe('12:30');
      expect(shortSlot.totalSeats).toBe(4);

      // Irregular duration: 1 hour and 15 minutes (75 min)
      const irregularSlot = await service.create({
        date: '2033-05-10',
        startTime: '12:45',
        endTime: '14:00',
        tables: [{ tableNumber: 1, seats: 2 }],
      });
      expect(irregularSlot.startTime).toBe('12:45');
      expect(irregularSlot.endTime).toBe('14:00');

      // Meal services across different times of day
      const breakfast = await service.create({
        date: '2033-05-10',
        startTime: '07:30',
        endTime: '09:00',
        tables: [{ tableNumber: 1, seats: 6 }],
      });
      const dinner = await service.create({
        date: '2033-05-10',
        startTime: '19:30',
        endTime: '22:30',
        tables: [{ tableNumber: 1, seats: 8 }],
      });

      expect(breakfast.totalSeats).toBe(6);
      expect(dinner.totalSeats).toBe(8);
    });

    it('rejects slot whose end time is before or equal to start time at the database level', async () => {
      await expect(
        service.create({
          date: '2033-05-10',
          startTime: '14:00',
          endTime: '12:00',
          tables: [{ tableNumber: 1, seats: 4 }],
        }),
      ).rejects.toThrow();
    });
  });

  describe('Multiple slots on a given day and ordering (Clarification 3)', () => {
    it('creates multiple meal service slots (e.g. 12-13 and 13-14) and lists them in start order', async () => {
      const date = '2033-06-01';

      // Insert in non-chronological order to test sorting
      const dinner = await service.create({
        date,
        startTime: '19:30',
        endTime: '21:30',
        tables: [{ tableNumber: 1, seats: 10 }],
      });
      const lunch1 = await service.create({
        date,
        startTime: '12:00',
        endTime: '13:00',
        tables: [{ tableNumber: 1, seats: 4 }],
      });
      const lunch2 = await service.create({
        date,
        startTime: '13:00',
        endTime: '14:00',
        tables: [{ tableNumber: 1, seats: 6 }],
      });

      const daySchedule = await service.listByDate(date);
      expect(daySchedule).toHaveLength(3);
      expect(daySchedule.map((s) => s.id)).toEqual([lunch1.id, lunch2.id, dinner.id]);
      expect(daySchedule.map((s) => s.startTime)).toEqual(['12:00', '13:00', '19:30']);
      expect(daySchedule.map((s) => s.totalSeats)).toEqual([4, 6, 10]);
    });

    it('isolates slots by date', async () => {
      await service.create({
        date: '2033-06-01',
        startTime: '12:00',
        endTime: '13:00',
        tables: [{ tableNumber: 1, seats: 4 }],
      });
      await service.create({
        date: '2033-06-02',
        startTime: '12:00',
        endTime: '13:00',
        tables: [{ tableNumber: 1, seats: 4 }],
      });

      const slotsDay1 = await service.listByDate('2033-06-01');
      expect(slotsDay1).toHaveLength(1);
      expect(slotsDay1[0].date).toBe('2033-06-01');

      const slotsDay3 = await service.listByDate('2033-06-03');
      expect(slotsDay3).toHaveLength(0);
    });
  });

  describe('No concept of fixed table set (Clarification 4)', () => {
    it('supports different table layouts and capacities at lunch vs dinner on the same day', async () => {
      const date = '2033-07-20';

      // Lunch on terrace: 4 tables, 24 seats
      const lunch = await service.create({
        date,
        startTime: '12:00',
        endTime: '14:00',
        tables: [
          { tableNumber: 1, seats: 6 },
          { tableNumber: 2, seats: 6 },
          { tableNumber: 3, seats: 6 },
          { tableNumber: 4, seats: 6 },
        ],
      });

      // Dinner inside: 2 cozy tables with different table numbers and seats, 10 seats
      const dinner = await service.create({
        date,
        startTime: '19:00',
        endTime: '21:00',
        tables: [
          { tableNumber: 10, seats: 4 },
          { tableNumber: 11, seats: 6 },
        ],
      });

      expect(lunch.totalSeats).toBe(24);
      expect(lunch.tables).toHaveLength(4);

      expect(dinner.totalSeats).toBe(10);
      expect(dinner.tables).toHaveLength(2);

      const schedule = await service.listByDate(date);
      expect(schedule.find((s) => s.id === lunch.id)?.totalSeats).toBe(24);
      expect(schedule.find((s) => s.id === dinner.id)?.totalSeats).toBe(10);
    });

    it('supports adapting capacity for sunny vs rainy day scenarios', async () => {
      // Sunny day: outdoor terrace tables included
      const sunny = await service.create({
        date: '2033-08-01',
        startTime: '12:00',
        endTime: '14:00',
        tables: [
          { tableNumber: 1, seats: 10 },
          { tableNumber: 2, seats: 10 },
          { tableNumber: 3, seats: 10 },
        ],
      });
      expect(sunny.totalSeats).toBe(30);

      // Rainy day: indoor only, reduced capacity
      const rainy = await service.create({
        date: '2033-08-02',
        startTime: '12:00',
        endTime: '14:00',
        tables: [{ tableNumber: 1, seats: 8 }],
      });
      expect(rainy.totalSeats).toBe(8);
    });

    it('creates a slot without tables initially (0 seats) and allows defining them later', async () => {
      const slot = await service.create({
        date: '2033-08-10',
        startTime: '12:00',
        endTime: '13:00',
      });
      expect(slot.tables).toEqual([]);
      expect(slot.totalSeats).toBe(0);

      // Define tables later
      const updated = await service.defineTables(slot.id, {
        tables: [
          { tableNumber: 1, seats: 4 },
          { tableNumber: 2, seats: 4 },
        ],
      });
      expect(updated.id).toBe(slot.id);
      expect(updated.totalSeats).toBe(8);
      expect(updated.tables).toEqual([
        { tableNumber: 1, seats: 4 },
        { tableNumber: 2, seats: 4 },
      ]);

      const stored = await service.findOne(slot.id);
      expect(stored).toEqual(updated);
    });
  });

  describe('Reusing table list from previous slots (Clarification 2)', () => {
    it('copies tables when creating a new slot using copyTablesFromSlotId', async () => {
      const template = await service.create({
        date: '2033-09-01',
        startTime: '12:00',
        endTime: '13:00',
        tables: [
          { tableNumber: 1, seats: 2 },
          { tableNumber: 2, seats: 4 },
          { tableNumber: 3, seats: 8 },
        ],
      });
      expect(template.totalSeats).toBe(14);

      // Create a second slot reusing the table configuration
      const copied = await service.create({
        date: '2033-09-01',
        startTime: '13:00',
        endTime: '14:00',
        copyTablesFromSlotId: template.id,
      });

      expect(copied.id).not.toBe(template.id);
      expect(copied.tables).toEqual(template.tables);
      expect(copied.totalSeats).toBe(14);

      // Verify persistence in PostgreSQL
      const persisted = await service.findOne(copied.id);
      expect(persisted).toEqual(copied);
    });

    it('copies tables to an empty slot using defineTables with copyTablesFromSlotId', async () => {
      const source = await service.create({
        date: '2033-09-02',
        startTime: '12:00',
        endTime: '13:00',
        tables: [
          { tableNumber: 10, seats: 4 },
          { tableNumber: 20, seats: 6 },
        ],
      });

      const empty = await service.create({
        date: '2033-09-02',
        startTime: '13:00',
        endTime: '14:00',
      });
      expect(empty.totalSeats).toBe(0);

      const updated = await service.defineTables(empty.id, {
        copyTablesFromSlotId: source.id,
      });

      expect(updated.id).toBe(empty.id);
      expect(updated.tables).toEqual(source.tables);
      expect(updated.totalSeats).toBe(10);
    });

    it('throws 404 when copyTablesFromSlotId references a non-existent slot', async () => {
      await expect(
        service.create({
          date: '2033-09-03',
          startTime: '12:00',
          endTime: '13:00',
          copyTablesFromSlotId: 999_999,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const empty = await service.create({
        date: '2033-09-03',
        startTime: '13:00',
        endTime: '14:00',
      });
      await expect(
        service.defineTables(empty.id, { copyTablesFromSlotId: 999_999 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 422 when attempting to copy tables from a slot that has no tables', async () => {
      const emptySource = await service.create({
        date: '2033-09-04',
        startTime: '12:00',
        endTime: '13:00',
      });

      await expect(
        service.create({
          date: '2033-09-04',
          startTime: '13:00',
          endTime: '14:00',
          copyTablesFromSlotId: emptySource.id,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      const target = await service.create({
        date: '2033-09-04',
        startTime: '14:00',
        endTime: '15:00',
      });
      await expect(
        service.defineTables(target.id, { copyTablesFromSlotId: emptySource.id }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('Slot and table constraints & integrity', () => {
    it('throws 409 when attempting to create a slot on the exact same date and times', async () => {
      await service.create({
        date: '2033-10-01',
        startTime: '12:00',
        endTime: '14:00',
        tables: [{ tableNumber: 1, seats: 4 }],
      });

      await expect(
        service.create({
          date: '2033-10-01',
          startTime: '12:00',
          endTime: '14:00',
          tables: [{ tableNumber: 2, seats: 6 }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws 409 when trying to define tables on a slot that already has tables', async () => {
      const slot = await service.create({
        date: '2033-10-02',
        startTime: '12:00',
        endTime: '14:00',
        tables: [{ tableNumber: 1, seats: 4 }],
      });

      await expect(
        service.defineTables(slot.id, {
          tables: [{ tableNumber: 1, seats: 6 }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws 404 when defineTables or findOne is called on a non-existent slot id', async () => {
      await expect(
        service.defineTables(999_999, {
          tables: [{ tableNumber: 1, seats: 4 }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      await expect(service.findOne(999_999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('prevents concurrent definitions on the same slot via database row locking', async () => {
      const slot = await service.create({
        date: '2033-10-03',
        startTime: '12:00',
        endTime: '14:00',
      });

      const [res1, res2] = await Promise.allSettled([
        service.defineTables(slot.id, { tables: [{ tableNumber: 1, seats: 4 }] }),
        service.defineTables(slot.id, { tables: [{ tableNumber: 2, seats: 6 }] }),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
      const rejected = [res1, res2].filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

      const finalSlot = await service.findOne(slot.id);
      expect(finalSlot.tables).toHaveLength(1);
    });
  });
});
