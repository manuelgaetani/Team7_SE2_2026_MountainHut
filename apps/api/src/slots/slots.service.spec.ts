import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlotsRepository } from './slots.repository.js';
import type { SlotRow } from './slots.repository.js';
import { SlotsService } from './slots.service.js';

const slotRow = (overrides: Partial<SlotRow> = {}): SlotRow => ({
  id: 1,
  date: new Date('2026-11-02T00:00:00.000Z'),
  startTime: new Date('1970-01-01T12:00:00.000Z'),
  endTime: new Date('1970-01-01T13:00:00.000Z'),
  tables: [
    { tableNumber: 1, seats: 4 },
    { tableNumber: 2, seats: 6 },
  ],
  ...overrides,
});

describe('SlotsService', () => {
  let service: SlotsService;
  const tx = { marker: 'tx' };
  const prisma = { $transaction: vi.fn() };
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
    prisma.$transaction.mockImplementation((work: (client: typeof tx) => unknown) => work(tx));
    const module = await Test.createTestingModule({
      providers: [
        SlotsService,
        { provide: PrismaService, useValue: prisma },
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
      await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    const input = { date: '2026-11-02', startTime: '12:00', endTime: '13:00' };
    const tables = [{ tableNumber: 1, seats: 4 }];

    it('creates the slot and its tables in one transaction', async () => {
      repo.create.mockResolvedValue(7);
      repo.findById.mockResolvedValue(slotRow({ id: 7, tables }));
      await service.create({ ...input, tables });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(repo.create).toHaveBeenCalledWith(tx, {
        date: new Date('2026-11-02T00:00:00.000Z'),
        startTime: new Date('1970-01-01T12:00:00.000Z'),
        endTime: new Date('1970-01-01T13:00:00.000Z'),
      });
      expect(repo.createTables).toHaveBeenCalledWith(tx, 7, tables);
    });

    it('copies the tables of another slot', async () => {
      const source = slotRow({ id: 3 });
      repo.create.mockResolvedValue(8);
      repo.findById.mockImplementation((_client: unknown, id: number) =>
        Promise.resolve(id === 3 ? source : slotRow({ id: 8 })),
      );
      await service.create({ ...input, copyTablesFromSlotId: 3 });
      expect(repo.createTables).toHaveBeenCalledWith(tx, 8, source.tables);
    });

    it('throws NotFound, creating nothing, when the slot to copy from does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.create({ ...input, copyTablesFromSlotId: 99 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntity when the slot to copy from has no tables', async () => {
      repo.findById.mockResolvedValue(slotRow({ id: 3, tables: [] }));
      await expect(service.create({ ...input, copyTablesFromSlotId: 3 })).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('translates the unique violation into Conflict', async () => {
      repo.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(service.create(input)).rejects.toBeInstanceOf(ConflictException);
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
      await expect(service.defineTables(5, { tables })).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.createTables).not.toHaveBeenCalled();
    });

    it('throws Conflict when the slot already has tables', async () => {
      repo.lock.mockResolvedValue(true);
      repo.findTables.mockResolvedValue(tables);
      await expect(service.defineTables(5, { tables })).rejects.toBeInstanceOf(ConflictException);
      expect(repo.createTables).not.toHaveBeenCalled();
    });

    it('defines the tables of a slot that has none, locking it first', async () => {
      repo.lock.mockResolvedValue(true);
      repo.findTables.mockResolvedValue([]);
      repo.findById.mockResolvedValue(slotRow({ id: 5, tables }));
      const result = await service.defineTables(5, { tables });
      expect(repo.createTables).toHaveBeenCalledWith(tx, 5, tables);
      expect(result.totalSeats).toBe(4);
      const lockOrder = repo.lock.mock.invocationCallOrder[0];
      const readOrder = repo.findTables.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(readOrder);
    });
  });
});