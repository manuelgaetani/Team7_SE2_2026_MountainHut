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
    // MH-09: repeat a weekly schedule.
    lockDay: vi.fn(),
    lockBetween: vi.fn(),
    findBetween: vi.fn(),
    findReservedDates: vi.fn(),
    deleteSlots: vi.fn(),
    findTables: vi.fn(),
    create: vi.fn(),
    createTables: vi.fn(),
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

    // A booking locks its slot row, not the day (review of MH-09).
    it('locks the target slots after the days and before checking the reservations', async () => {
      const calls: string[] = [];
      repo.lockDay.mockImplementation(() => {
        calls.push('lockDay');
        return Promise.resolve();
      });
      repo.lockBetween.mockImplementation(() => {
        expect(inRun).toBe(true);
        calls.push('lockBetween');
        return Promise.resolve();
      });
      repo.findReservedDates.mockImplementation(() => {
        calls.push('findReservedDates');
        return Promise.resolve([]);
      });
      await service.repeatWeekly(input);
      expect(repo.lockBetween).toHaveBeenCalledExactlyOnceWith('2026-11-09', '2026-11-22');
      expect(calls.lastIndexOf('lockDay')).toBeLessThan(calls.indexOf('lockBetween'));
      expect(calls.indexOf('lockBetween')).toBeLessThan(calls.indexOf('findReservedDates'));
    });

    it('reads the 7-day source week and checks the whole target range', async () => {
      await service.repeatWeekly(input);
      expect(repo.findBetween).toHaveBeenNthCalledWith(1, '2026-11-02', '2026-11-08');
      expect(repo.findReservedDates).toHaveBeenCalledWith('2026-11-09', '2026-11-22');
      expect(repo.findBetween).toHaveBeenNthCalledWith(2, '2026-11-09', '2026-11-22');
    });

    it('does not delete anything when the target weeks are empty', async () => {
      const result = await service.repeatWeekly(input);
      expect(repo.deleteSlots).not.toHaveBeenCalled();
      expect(result.replacedSlotsCount).toBe(0);
    });

    it('copies a slot without tables without creating tables', async () => {
      repo.findBetween.mockImplementation((from: string) =>
        Promise.resolve(from === '2026-11-02' ? [slotRow({ tables: [] })] : []),
      );
      const result = await service.repeatWeekly({ ...input, repeatWeeks: 1 });
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.createTables).not.toHaveBeenCalled();
      expect(result.createdSlots[0]).toMatchObject({ tables: [], totalSeats: 0 });
    });

    it('returns the copies ordered by date and start time', async () => {
      const dinnerMonday = slotRow({
        id: 1,
        date: '2026-11-02',
        startTime: '19:00',
        endTime: '21:00',
      });
      const lunchMonday = slotRow({
        id: 2,
        date: '2026-11-02',
        startTime: '12:00',
        endTime: '14:00',
      });
      const lunchFriday = slotRow({
        id: 3,
        date: '2026-11-06',
        startTime: '12:00',
        endTime: '14:00',
      });
      repo.findBetween.mockImplementation((from: string) =>
        Promise.resolve(from === '2026-11-02' ? [lunchFriday, dinnerMonday, lunchMonday] : []),
      );
      const result = await service.repeatWeekly(input);
      expect(result.createdSlotsCount).toBe(6);
      expect(result.createdSlots.map((s) => `${s.date} ${s.startTime}`)).toEqual([
        '2026-11-09 12:00',
        '2026-11-09 19:00',
        '2026-11-13 12:00',
        '2026-11-16 12:00',
        '2026-11-16 19:00',
        '2026-11-20 12:00',
      ]);
    });

    it('locks the 7 days of a single target week when repeatWeeks is 1', async () => {
      await service.repeatWeekly({ ...input, repeatWeeks: 1 });
      expect(repo.lockDay.mock.calls.map(([day]) => day)).toEqual([
        '2026-11-09',
        '2026-11-10',
        '2026-11-11',
        '2026-11-12',
        '2026-11-13',
        '2026-11-14',
        '2026-11-15',
      ]);
    });

    // The weeks start on the weekday of sourceStartDate, not on Monday.
    it.each([
      ['2026-11-09', '2026-11-09'],
      ['2026-11-15', '2026-11-09'],
      ['2026-11-16', '2026-11-16'],
      ['2026-11-22', '2026-11-16'],
    ])('names the week of a reservation on %s as starting %s', async (reserved, weekStart) => {
      repo.findReservedDates.mockResolvedValue([reserved]);
      await expect(service.repeatWeekly(input)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: `The week starting ${weekStart} has reservations: its schedule cannot be replaced`,
      });
    });

    it('checks the source week before the reservations', async () => {
      repo.findBetween.mockResolvedValue([]);
      repo.findReservedDates.mockResolvedValue(['2026-11-09']);
      await expect(service.repeatWeekly(input)).rejects.toMatchObject({ code: 'UNPROCESSABLE' });
    });

    it('lets a database failure through without going on', async () => {
      const failure = new Error('database unreachable');
      repo.create.mockRejectedValue(failure);
      await expect(service.repeatWeekly(input)).rejects.toBe(failure);
      expect(repo.createTables).not.toHaveBeenCalled();
    });
  });
});
