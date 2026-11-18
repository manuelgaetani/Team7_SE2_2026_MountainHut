import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { UnitOfWork } from '../../shared-kernel/unit-of-work.js';
import type { Slot } from '../domain/slot.js';
import { SlotsRepository } from './slots.repository.port.js';
import { SlotsService } from './slots.service.js';

const slotRow = (overrides: Partial<Slot> = {}): Slot => ({
  id: 1,
  date: '2026-11-02',
  startTime: '12:00',
  endTime: '13:00',
  tables: [
    { tableNumber: 1, seats: 4 },
    { tableNumber: 2, seats: 6 },
  ],
  ...overrides,
});

describe('SlotsService', () => {
  let service: SlotsService;
  const uow = { run: vi.fn() };
  // Whether the repository call happened inside uow.run.
  let inRun = false;
  const repo = {
    findById: vi.fn(),
    findByDate: vi.fn(),
    lock: vi.fn(),
    // Used by create (MH-02, no overlapping slots): by default no overlapping slot exists.
    lockDay: vi.fn(),
    findOverlapping: vi.fn(),
    findBetween: vi.fn(),
    findReservedDates: vi.fn(),
    deleteSlots: vi.fn(),
    findTables: vi.fn(),
    create: vi.fn(),
    createTables: vi.fn(),
    findFloorAllocations: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    inRun = false;
    uow.run.mockImplementation(async (work: () => Promise<unknown>) => {
      inRun = true;
      try {
        return await work();
      } finally {
        inRun = false;
      }
    });
    const module = await Test.createTestingModule({
      providers: [
        SlotsService,
        { provide: UnitOfWork, useValue: uow },
        { provide: SlotsRepository, useValue: repo },
      ],
    }).compile();
    service = module.get(SlotsService);
  });

  describe('findOne', () => {
    it('returns the local date and times of the slot with its total seats', async () => {
      repo.findById.mockResolvedValue(slotRow());
      await expect(service.findOne(1)).resolves.toEqual({
        id: 1,
        date: '2026-11-02',
        startTime: '12:00',
        endTime: '13:00',
        tables: [
          { tableNumber: 1, seats: 4 },
          { tableNumber: 2, seats: 6 },
        ],
        totalSeats: 10,
      });
    });

    it('throws NotFound when the slot does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Slot not found',
      });
    });
  });

  describe('create', () => {
    const input = { date: '2026-11-02', startTime: '12:00', endTime: '13:00' };
    const tables = [{ tableNumber: 1, seats: 4 }];

    it('creates the slot and its tables in one transaction', async () => {
      const writesInRun: boolean[] = [];
      repo.create.mockImplementation(() => {
        writesInRun.push(inRun);
        return Promise.resolve(7);
      });
      repo.createTables.mockImplementation(() => {
        writesInRun.push(inRun);
        return Promise.resolve();
      });
      repo.findById.mockResolvedValue(slotRow({ id: 7, tables }));
      await service.create({ ...input, tables });
      expect(uow.run).toHaveBeenCalledTimes(1);
      expect(repo.create).toHaveBeenCalledWith(input);
      expect(repo.createTables).toHaveBeenCalledWith(7, tables);
      expect(writesInRun).toEqual([true, true]);
    });

    it('copies the tables of another slot', async () => {
      const source = slotRow({ id: 3 });
      repo.create.mockResolvedValue(8);
      repo.findById.mockImplementation((id: number) =>
        Promise.resolve(id === 3 ? source : slotRow({ id: 8 })),
      );
      await service.create({ ...input, copyTablesFromSlotId: 3 });
      expect(repo.createTables).toHaveBeenCalledWith(8, source.tables);
    });

    it('locks the day before looking for an overlapping slot, inside the transaction', async () => {
      const calls: string[] = [];
      repo.lockDay.mockImplementation(() => {
        calls.push(`lockDay:${inRun}`);
        return Promise.resolve();
      });
      repo.findOverlapping.mockImplementation(() => {
        calls.push(`findOverlapping:${inRun}`);
        return Promise.resolve(null);
      });
      repo.create.mockResolvedValue(7);
      repo.findById.mockResolvedValue(slotRow({ id: 7 }));
      await service.create(input);
      expect(repo.lockDay).toHaveBeenCalledWith('2026-11-02');
      expect(repo.findOverlapping).toHaveBeenCalledWith(input);
      expect(calls).toEqual(['lockDay:true', 'findOverlapping:true']);
    });

    it('refuses a slot that overlaps another slot of the same day, writing nothing', async () => {
      repo.findOverlapping.mockResolvedValue(slotRow({ startTime: '11:30', endTime: '12:30' }));
      await expect(service.create(input)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'This slot overlaps the slot 11:30–12:30 of the same day',
      });
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.createTables).not.toHaveBeenCalled();
    });

    it('throws NotFound, creating nothing, when the slot to copy from does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.create({ ...input, copyTablesFromSlotId: 99 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'The slot to copy the tables from does not exist',
      });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntity when the slot to copy from has no tables', async () => {
      repo.findById.mockResolvedValue(slotRow({ id: 3, tables: [] }));
      await expect(service.create({ ...input, copyTablesFromSlotId: 3 })).rejects.toMatchObject({
        code: 'UNPROCESSABLE',
        message: 'The slot to copy the tables from has no tables',
      });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('lets the conflict raised by the repository through', async () => {
      repo.create.mockRejectedValue(
        new DomainError('CONFLICT', 'A slot with the same date, start and end already exists'),
      );
      await expect(service.create(input)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'A slot with the same date, start and end already exists',
      });
    });

    it('rethrows database errors other than a duplicate slot', async () => {
      const failure = new Error('database unreachable');
      repo.create.mockRejectedValue(failure);
      await expect(service.create(input)).rejects.toBe(failure);
    });

    it('throws Conflict, creating nothing, when the slot overlaps another slot of the day', async () => {
      const calls: string[] = [];
      repo.lockDay.mockImplementation(() => {
        calls.push(inRun ? 'lockDay in run' : 'lockDay');
        return Promise.resolve();
      });
      repo.findOverlapping.mockImplementation(() => {
        calls.push('findOverlapping');
        return Promise.resolve(slotRow({ id: 2, startTime: '12:30', endTime: '13:30' }));
      });
      await expect(service.create(input)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'This slot overlaps the slot 12:30–13:30 of the same day',
      });
      expect(repo.lockDay).toHaveBeenCalledWith('2026-11-02');
      expect(repo.findOverlapping).toHaveBeenCalledWith(input);
      expect(calls).toEqual(['lockDay in run', 'findOverlapping']);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('floorPlan', () => {
    const allocation = {
      bookingId: 9,
      fullName: 'Anna Rossi',
      partySize: 3,
      status: 'CONFIRMED' as const,
      startTime: '12:00',
      endTime: '13:00',
      tableNumber: 1,
      assignedSeats: 3,
    };

    it('throws NotFound, reading no seats, when the slot does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.floorPlan(99)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Slot not found',
      });
      expect(repo.findFloorAllocations).not.toHaveBeenCalled();
    });

    it('builds the plan from the tables of the slot and the seats taken on them', async () => {
      repo.findById.mockResolvedValue(slotRow({ id: 5 }));
      repo.findFloorAllocations.mockResolvedValue([allocation]);
      const plan = await service.floorPlan(5);
      expect(repo.findFloorAllocations).toHaveBeenCalledWith(5);
      expect(plan.slot).toEqual({
        id: 5,
        date: '2026-11-02',
        startTime: '12:00',
        endTime: '13:00',
      });
      expect(plan.tables[0]).toMatchObject({ tableNumber: 1, occupiedSeats: 3, freeSeats: 1 });
      expect(plan.groups).toMatchObject([{ label: 'A', fullName: 'Anna Rossi' }]);
      expect(plan.totals).toMatchObject({ capacity: 10, occupiedSeats: 3, freeSeats: 7 });
    });

    it('shows every seat free when nobody has booked', async () => {
      repo.findById.mockResolvedValue(slotRow());
      repo.findFloorAllocations.mockResolvedValue([]);
      const plan = await service.floorPlan(1);
      expect(plan.groups).toEqual([]);
      expect(plan.totals.freeSeats).toBe(10);
    });
  });

  describe('defineTables', () => {
    const tables = [{ tableNumber: 1, seats: 4 }];

    it('throws NotFound when the slot does not exist', async () => {
      repo.lock.mockResolvedValue(false);
      await expect(service.defineTables(5, { tables })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Slot not found',
      });
      expect(repo.createTables).not.toHaveBeenCalled();
    });

    it('throws Conflict when the slot already has tables', async () => {
      repo.lock.mockResolvedValue(true);
      repo.findTables.mockResolvedValue(tables);
      await expect(service.defineTables(5, { tables })).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'This slot already has tables: changing them is MH-19',
      });
      expect(repo.createTables).not.toHaveBeenCalled();
    });

    it('defines the tables of a slot that has none, locking it first', async () => {
      let lockedInRun = false;
      repo.lock.mockImplementation(() => {
        lockedInRun = inRun;
        return Promise.resolve(true);
      });
      repo.findTables.mockResolvedValue([]);
      repo.findById.mockResolvedValue(slotRow({ id: 5, tables }));
      const result = await service.defineTables(5, { tables });
      expect(lockedInRun).toBe(true);
      expect(repo.createTables).toHaveBeenCalledWith(5, tables);
      expect(result.totalSeats).toBe(4);
      const lockOrder = repo.lock.mock.invocationCallOrder[0];
      const readOrder = repo.findTables.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(readOrder);
    });
  });

  // MH-09: copy the slots of a week into the next weeks.
  describe('repeatWeekly', () => {
    const input = { sourceStartDate: '2026-11-02', repeatWeeks: 2 };
    const source = slotRow({ id: 1, date: '2026-11-03', tables: [{ tableNumber: 1, seats: 4 }] });

    beforeEach(() => {
      repo.findBetween.mockImplementation((from: string) =>
        Promise.resolve(from === '2026-11-02' ? [source] : []),
      );
      repo.findReservedDates.mockResolvedValue([]);
      let next = 100;
      repo.create.mockImplementation(() => Promise.resolve(next++));
    });

    it('locks every target day in date order, inside the unit of work', async () => {
      const locked: string[] = [];
      repo.lockDay.mockImplementation((day: string) => {
        expect(inRun).toBe(true);
        locked.push(day);
        return Promise.resolve();
      });
      await service.repeatWeekly(input);
      expect(locked).toHaveLength(14);
      expect(locked[0]).toBe('2026-11-09');
      expect(locked[13]).toBe('2026-11-22');
      expect(uow.run).toHaveBeenCalledTimes(1);
    });

    it('creates a copy of each source slot, with its tables, in each target week', async () => {
      const result = await service.repeatWeekly(input);
      expect(repo.create).toHaveBeenNthCalledWith(1, {
        date: '2026-11-10',
        startTime: '12:00',
        endTime: '13:00',
      });
      expect(repo.create).toHaveBeenNthCalledWith(2, {
        date: '2026-11-17',
        startTime: '12:00',
        endTime: '13:00',
      });
      expect(repo.createTables).toHaveBeenCalledWith(100, [{ tableNumber: 1, seats: 4 }]);
      expect(result).toMatchObject({
        targetWeeks: 2,
        createdSlotsCount: 2,
        replacedSlotsCount: 0,
      });
      expect(result.createdSlots[0]).toMatchObject({ id: 100, date: '2026-11-10', totalSeats: 4 });
    });

    it('deletes the slots already in the target weeks first', async () => {
      repo.findBetween.mockImplementation((from: string) =>
        Promise.resolve(
          from === '2026-11-02' ? [source] : [slotRow({ id: 7 }), slotRow({ id: 8 })],
        ),
      );
      const result = await service.repeatWeekly(input);
      expect(repo.deleteSlots).toHaveBeenCalledWith([7, 8]);
      expect(repo.deleteSlots.mock.invocationCallOrder[0]).toBeLessThan(
        repo.create.mock.invocationCallOrder[0]!,
      );
      expect(result.replacedSlotsCount).toBe(2);
    });

    it('is unprocessable when the source week has no slots', async () => {
      repo.findBetween.mockResolvedValue([]);
      await expect(service.repeatWeekly(input)).rejects.toMatchObject({
        code: 'UNPROCESSABLE',
        message: 'Source week contains no time slots to repeat',
      });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('is a conflict when a target week has reservations, naming that week', async () => {
      repo.findReservedDates.mockResolvedValue(['2026-11-19']);
      await expect(service.repeatWeekly(input)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'The week starting 2026-11-16 has reservations: its schedule cannot be replaced',
      });
      expect(repo.deleteSlots).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });
  });
});
