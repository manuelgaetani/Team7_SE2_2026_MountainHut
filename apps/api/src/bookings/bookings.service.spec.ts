import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { MIN_LEAD_MS } from './booking-policy.js';
import { BookingsRepository } from './bookings.repository.js';
import { BookingsService } from './bookings.service.js';

const NOW = new Date('2026-11-01T10:00:00Z');
const slotStart = new Date(NOW.getTime() + MIN_LEAD_MS);
const input = { slotId: 3, partySize: 2 };
const storedBooking = { id: 9, slotId: 3, partySize: 2, status: 'CONFIRMED' as const };

describe('BookingsService', () => {
  let service: BookingsService;
  const tx = { marker: 'tx' };
  const prisma = { $transaction: vi.fn() };
  const repo = {
    lockSlotAndGetStart: vi.fn(),
    findFreeSeatsByTable: vi.fn(),
    findHikerIdByUserId: vi.fn(),
    findUpcomingSlots: vi.fn(),
    hasActiveBooking: vi.fn(),
    createConfirmedBooking: vi.fn(),
    createBookingTables: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.setSystemTime(NOW);
    prisma.$transaction.mockImplementation((work: (client: typeof tx) => unknown) => work(tx));
    repo.findHikerIdByUserId.mockResolvedValue(7);
    repo.lockSlotAndGetStart.mockResolvedValue(slotStart);
    repo.hasActiveBooking.mockResolvedValue(false);
    repo.findFreeSeatsByTable.mockResolvedValue([{ tableNumber: 1, freeSeats: 4 }]);
    repo.createConfirmedBooking.mockResolvedValue(storedBooking);
    const module = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: BookingsRepository, useValue: repo },
      ],
    }).compile();
    service = module.get(BookingsService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  const expectNothingWritten = () => {
    expect(repo.createConfirmedBooking).not.toHaveBeenCalled();
    expect(repo.createBookingTables).not.toHaveBeenCalled();
  };

  describe('when the booking is accepted', () => {
    it('returns the stored booking with its tables', async () => {
      await expect(service.create(1, input)).resolves.toEqual({
        ...storedBooking,
        tables: [{ tableNumber: 1, assignedSeats: 2 }],
      });
    });

    it('stores the booking for the hiker of the user, not for the user id', async () => {
      await service.create(1, input);
      expect(repo.findHikerIdByUserId).toHaveBeenCalledWith(tx, 1);
      expect(repo.createConfirmedBooking).toHaveBeenCalledWith(tx, {
        hikerId: 7,
        slotId: 3,
        partySize: 2,
      });
    });

    it('stores the table assignments on the new booking', async () => {
      await service.create(1, input);
      expect(repo.createBookingTables).toHaveBeenCalledWith(tx, 9, 3, [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
    });

    it('runs every step in one transaction', async () => {
      await service.create(1, input);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(repo.findFreeSeatsByTable).toHaveBeenCalledWith(tx, 3);
    });

    it('locks the slot before reading the free seats', async () => {
      await service.create(1, input);
      const lockOrder = repo.lockSlotAndGetStart.mock.invocationCallOrder[0];
      const readOrder = repo.findFreeSeatsByTable.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(readOrder);
    });

    it('stores the booking before its table assignments', async () => {
      await service.create(1, input);
      const bookingOrder = repo.createConfirmedBooking.mock.invocationCallOrder[0];
      const tablesOrder = repo.createBookingTables.mock.invocationCallOrder[0];
      expect(bookingOrder).toBeLessThan(tablesOrder);
    });

    it('uses Europe/Rome as the default booking time zone', async () => {
      vi.stubEnv('BOOKING_TIMEZONE', undefined);
      await service.create(1, input);
      expect(repo.lockSlotAndGetStart).toHaveBeenCalledWith(tx, 3, 'Europe/Rome');
    });

    it('uses the configured booking time zone', async () => {
      vi.stubEnv('BOOKING_TIMEZONE', 'UTC');
      await service.create(1, input);
      expect(repo.lockSlotAndGetStart).toHaveBeenCalledWith(tx, 3, 'UTC');
    });
  });

  describe('when the user has no hiker profile', () => {
    it('rejects the booking before touching the slot', async () => {
      repo.findHikerIdByUserId.mockResolvedValue(null);
      await expect(service.create(1, input)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.lockSlotAndGetStart).not.toHaveBeenCalled();
      expectNothingWritten();
    });
  });

  describe('when the slot does not exist', () => {
    it('rejects the booking before reading the seats', async () => {
      repo.lockSlotAndGetStart.mockResolvedValue(null);
      await expect(service.create(1, input)).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.findFreeSeatsByTable).not.toHaveBeenCalled();
      expectNothingWritten();
    });
  });

  describe('when the hiker already has a booking for the slot', () => {
    it('answers 409 after locking the slot and writes nothing', async () => {
      repo.hasActiveBooking.mockResolvedValue(true);
      await expect(service.create(1, input)).rejects.toThrow(
        new ConflictException('You already have a booking for this slot'),
      );
      expect(repo.hasActiveBooking).toHaveBeenCalledWith(tx, 7, input.slotId);
      expect(repo.lockSlotAndGetStart.mock.invocationCallOrder[0]).toBeLessThan(
        repo.hasActiveBooking.mock.invocationCallOrder[0]!,
      );
      expectNothingWritten();
    });
  });

  describe('listSlots', () => {
    const visible = {
      id: 1,
      date: '2026-11-01',
      startTime: '20:00',
      endTime: '22:00',
      freeSeats: 4,
    };
    const slot = { ...visible, startsAt: slotStart };

    it('reads the slots in the booking time zone', async () => {
      repo.findUpcomingSlots.mockResolvedValue([]);
      await expect(service.listSlots()).resolves.toEqual([]);
      expect(repo.findUpcomingSlots).toHaveBeenCalledWith(prisma, 'Europe/Rome', NOW);
    });

    it('marks each slot with its availability and hides the raw start', async () => {
      repo.findUpcomingSlots.mockResolvedValue([
        slot,
        { ...slot, id: 2, freeSeats: 0 },
        { ...slot, id: 3, startsAt: new Date(slotStart.getTime() - 1) },
      ]);
      await expect(service.listSlots()).resolves.toEqual([
        { ...visible, availability: 'AVAILABLE' },
        { ...visible, id: 2, freeSeats: 0, availability: 'FULL' },
        { ...visible, id: 3, availability: 'TOO_LATE' },
      ]);
    });
  });

  describe('when the policy refuses the booking', () => {
    it('answers 422 when less than two hours remain', async () => {
      repo.lockSlotAndGetStart.mockResolvedValue(new Date(slotStart.getTime() - 1));
      await expect(service.create(1, input)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expectNothingWritten();
    });

    it('accepts a slot exactly two hours from now', async () => {
      await expect(service.create(1, input)).resolves.toMatchObject({ id: 9 });
    });

    it('answers 409 when the seats are not enough', async () => {
      repo.findFreeSeatsByTable.mockResolvedValue([{ tableNumber: 1, freeSeats: 1 }]);
      await expect(service.create(1, input)).rejects.toBeInstanceOf(ConflictException);
      expectNothingWritten();
    });
  });

  describe('when a write fails', () => {
    it('propagates the error so that the transaction rolls back', async () => {
      const failure = new Error('write failed');
      repo.createBookingTables.mockRejectedValue(failure);
      await expect(service.create(1, input)).rejects.toBe(failure);
    });
  });
});
