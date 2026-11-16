import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
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

    it('translates the unique violation into Conflict', async () => {
      repo.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
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
});
