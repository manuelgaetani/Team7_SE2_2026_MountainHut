import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { AppConfig } from '../../config/app-config.js';
import { UnitOfWork } from '../../shared-kernel/unit-of-work.js';
import { MIN_LEAD_MS } from '../domain/booking-policy.js';
import { BookingsRepository } from './bookings.repository.port.js';
import { BookingsService } from './bookings.service.js';
import { ConfirmationSender } from './confirmation-sender.js';

const NOW = new Date('2026-11-01T10:00:00Z');
const slotStart = new Date(NOW.getTime() + MIN_LEAD_MS);
const input = { slotId: 3, partySize: 2 };
// New bookings are stored as pending: the confirmation email confirms them.
const storedBooking = { id: 9, slotId: 3, partySize: 2, status: 'PENDING' as const };

describe('BookingsService', () => {
  let service: BookingsService;
  const uow = { run: vi.fn() };
  // Called when the unit of work starts and ends, to tell which repository calls ran inside it.
  const runStarted = vi.fn();
  const runEnded = vi.fn();
  const calledInRun = (fn: Mock) => {
    const order = fn.mock.invocationCallOrder[0];
    return (
      order > runStarted.mock.invocationCallOrder[0] && order < runEnded.mock.invocationCallOrder[0]
    );
  };
  const repo = {
    lockSlotAndGetStart: vi.fn(),
    findFreeSeatsByTable: vi.fn(),
    findHikerIdByUserId: vi.fn(),
    hasActiveBooking: vi.fn(),
    createBooking: vi.fn(),
    createBookingTables: vi.fn(),
    lockBooking: vi.fn(),
    cancelBooking: vi.fn(),
  };
  const confirmationSender = { send: vi.fn() };

  const config = { bookingTimeZone: 'Europe/Rome' };

  beforeEach(async () => {
    vi.resetAllMocks();
    config.bookingTimeZone = 'Europe/Rome';
    vi.setSystemTime(NOW);
    uow.run.mockImplementation(async (work: () => Promise<unknown>) => {
      runStarted();
      try {
        return await work();
      } finally {
        runEnded();
      }
    });
    repo.findHikerIdByUserId.mockResolvedValue(7);
    repo.lockSlotAndGetStart.mockResolvedValue(slotStart);
    repo.hasActiveBooking.mockResolvedValue(false);
    repo.findFreeSeatsByTable.mockResolvedValue([{ tableNumber: 1, freeSeats: 4 }]);
    repo.createBooking.mockResolvedValue(storedBooking);
    confirmationSender.send.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: UnitOfWork, useValue: uow },
        { provide: BookingsRepository, useValue: repo },
        { provide: ConfirmationSender, useValue: confirmationSender },
        { provide: AppConfig, useValue: config },
      ],
    }).compile();
    service = module.get(BookingsService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  const expectNothingWritten = () => {
    expect(repo.createBooking).not.toHaveBeenCalled();
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
      expect(repo.findHikerIdByUserId).toHaveBeenCalledWith(1);
      expect(repo.createBooking).toHaveBeenCalledWith({
        hikerId: 7,
        slotId: 3,
        partySize: 2,
        requirements: null,
      });
    });

    it('stores the requirements of the party', async () => {
      await service.create(1, { ...input, requirements: 'no nuts' });
      expect(repo.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({ requirements: 'no nuts' }),
      );
    });

    it('stores empty requirements as none', async () => {
      await service.create(1, { ...input, requirements: '' });
      expect(repo.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({ requirements: null }),
      );
    });

    it('stores the table assignments on the new booking', async () => {
      await service.create(1, input);
      expect(repo.createBookingTables).toHaveBeenCalledWith(9, 3, [
        { tableNumber: 1, assignedSeats: 2 },
      ]);
    });

    it('runs every step in one transaction', async () => {
      await service.create(1, input);
      expect(uow.run).toHaveBeenCalledTimes(1);
      expect(repo.findFreeSeatsByTable).toHaveBeenCalledWith(3);
      for (const step of [
        repo.findHikerIdByUserId,
        repo.lockSlotAndGetStart,
        repo.hasActiveBooking,
        repo.findFreeSeatsByTable,
        repo.createBooking,
        repo.createBookingTables,
      ]) {
        expect(calledInRun(step)).toBe(true);
      }
    });

    it('locks the slot before reading the free seats', async () => {
      await service.create(1, input);
      const lockOrder = repo.lockSlotAndGetStart.mock.invocationCallOrder[0];
      const readOrder = repo.findFreeSeatsByTable.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(readOrder);
    });

    it('stores the booking before its table assignments', async () => {
      await service.create(1, input);
      const bookingOrder = repo.createBooking.mock.invocationCallOrder[0];
      const tablesOrder = repo.createBookingTables.mock.invocationCallOrder[0];
      expect(bookingOrder).toBeLessThan(tablesOrder);
    });

    it('uses Europe/Rome as the default booking time zone', async () => {
      await service.create(1, input);
      expect(repo.lockSlotAndGetStart).toHaveBeenCalledWith(3, 'Europe/Rome');
    });

    it('uses the configured booking time zone', async () => {
      config.bookingTimeZone = 'UTC';
      await service.create(1, input);
      expect(repo.lockSlotAndGetStart).toHaveBeenCalledWith(3, 'UTC');
    });
  });

  describe('confirmation of the booking', () => {
    it('is started for the stored booking, after the transaction has been committed', async () => {
      await service.create(1, input);
      expect(confirmationSender.send).toHaveBeenCalledExactlyOnceWith(9);
      expect(confirmationSender.send.mock.invocationCallOrder[0]).toBeGreaterThan(
        runEnded.mock.invocationCallOrder[0],
      );
    });

    it('does not make the answer wait for it', async () => {
      confirmationSender.send.mockReturnValue(new Promise(() => undefined));
      await expect(service.create(1, input)).resolves.toMatchObject({ id: 9, status: 'PENDING' });
    });

    it('is not started when the booking is refused', async () => {
      repo.findFreeSeatsByTable.mockResolvedValue([{ tableNumber: 1, freeSeats: 1 }]);
      await expect(service.create(1, input)).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(confirmationSender.send).not.toHaveBeenCalled();
    });
  });

  describe('when the user has no hiker profile', () => {
    it('rejects the booking before touching the slot', async () => {
      repo.findHikerIdByUserId.mockResolvedValue(null);
      await expect(service.create(1, input)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'A hiker profile is required to book a table',
      });
      expect(repo.lockSlotAndGetStart).not.toHaveBeenCalled();
      expectNothingWritten();
    });
  });

  describe('when the slot does not exist', () => {
    it('rejects the booking before reading the seats', async () => {
      repo.lockSlotAndGetStart.mockResolvedValue(null);
      await expect(service.create(1, input)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Slot not found',
      });
      expect(repo.findFreeSeatsByTable).not.toHaveBeenCalled();
      expectNothingWritten();
    });
  });

  describe('when the hiker already has a booking for the slot', () => {
    it('answers 409 after locking the slot and writes nothing', async () => {
      repo.hasActiveBooking.mockResolvedValue(true);
      await expect(service.create(1, input)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'You already have a booking for this slot',
      });
      expect(repo.hasActiveBooking).toHaveBeenCalledWith(7, input.slotId);
      expect(repo.lockSlotAndGetStart.mock.invocationCallOrder[0]).toBeLessThan(
        repo.hasActiveBooking.mock.invocationCallOrder[0]!,
      );
      expectNothingWritten();
    });
  });

  describe('when the policy refuses the booking', () => {
    it('answers 422 when less than two hours remain', async () => {
      repo.lockSlotAndGetStart.mockResolvedValue(new Date(slotStart.getTime() - 1));
      await expect(service.create(1, input)).rejects.toMatchObject({
        code: 'UNPROCESSABLE',
        message: 'Less than 2 hours remaining before the slot starts',
      });
      expectNothingWritten();
    });

    it('accepts a slot exactly two hours from now', async () => {
      await expect(service.create(1, input)).resolves.toMatchObject({ id: 9 });
    });

    it('answers 409 when the seats are not enough', async () => {
      repo.findFreeSeatsByTable.mockResolvedValue([{ tableNumber: 1, freeSeats: 1 }]);
      await expect(service.create(1, input)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Insufficient seats available for this slot',
      });
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

  // MH-08: a hiker cancels a booking, so that its seats are free for other guests.
  describe('cancel', () => {
    const cancelled = { id: 9, slotId: 3, partySize: 2, status: 'CANCELLED' as const };

    beforeEach(() => {
      repo.lockBooking.mockResolvedValue({ hikerId: 7, status: 'CONFIRMED' });
      repo.cancelBooking.mockResolvedValue(cancelled);
    });

    describe('when the booking can be cancelled', () => {
      it.each(['CONFIRMED', 'PENDING'] as const)(
        'cancels a %s booking and returns it',
        async (status) => {
          repo.lockBooking.mockResolvedValue({ hikerId: 7, status });
          await expect(service.cancel(1, 9)).resolves.toEqual(cancelled);
          expect(repo.cancelBooking).toHaveBeenCalledWith(9);
        },
      );

      it('looks for the hiker of the user, not for the user id', async () => {
        await service.cancel(1, 9);
        expect(repo.findHikerIdByUserId).toHaveBeenCalledWith(1);
      });

      it('runs every step in one unit of work', async () => {
        await service.cancel(1, 9);
        expect(uow.run).toHaveBeenCalledTimes(1);
        expect(repo.lockBooking).toHaveBeenCalledWith(9);
        expect(calledInRun(repo.findHikerIdByUserId)).toBe(true);
        expect(calledInRun(repo.lockBooking)).toBe(true);
        expect(calledInRun(repo.cancelBooking)).toBe(true);
      });

      it('locks the booking before cancelling it', async () => {
        await service.cancel(1, 9);
        expect(repo.lockBooking.mock.invocationCallOrder[0]).toBeLessThan(
          repo.cancelBooking.mock.invocationCallOrder[0]!,
        );
      });

      it('sends no email', async () => {
        await service.cancel(1, 9);
        expect(confirmationSender.send).not.toHaveBeenCalled();
      });
    });

    describe('when the user has no hiker profile', () => {
      it('is forbidden before touching the booking', async () => {
        repo.findHikerIdByUserId.mockResolvedValue(null);
        await expect(service.cancel(1, 9)).rejects.toMatchObject({
          code: 'FORBIDDEN',
          message: 'A hiker profile is required to cancel a booking',
        });
        expect(repo.lockBooking).not.toHaveBeenCalled();
        expect(repo.cancelBooking).not.toHaveBeenCalled();
      });
    });

    describe('when the booking cannot be found by the hiker', () => {
      it('is not found when the booking does not exist', async () => {
        repo.lockBooking.mockResolvedValue(null);
        await expect(service.cancel(1, 9)).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: 'Booking not found',
        });
        expect(repo.cancelBooking).not.toHaveBeenCalled();
      });

      it('is not found, as for a missing booking, when it belongs to another hiker', async () => {
        repo.lockBooking.mockResolvedValue({ hikerId: 8, status: 'CONFIRMED' });
        await expect(service.cancel(1, 9)).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: 'Booking not found',
        });
        expect(repo.cancelBooking).not.toHaveBeenCalled();
      });
    });

    describe('when the booking is no longer active', () => {
      it.each([
        ['CANCELLED', 'This booking is already cancelled'],
        ['REJECTED', 'A rejected booking cannot be cancelled'],
      ] as const)('is a conflict for a %s booking and writes nothing', async (status, message) => {
        repo.lockBooking.mockResolvedValue({ hikerId: 7, status });
        await expect(service.cancel(1, 9)).rejects.toMatchObject({ code: 'CONFLICT', message });
        expect(repo.cancelBooking).not.toHaveBeenCalled();
      });
    });

    describe('when a write fails', () => {
      it('propagates the error so that the unit of work rolls back', async () => {
        const failure = new Error('write failed');
        repo.cancelBooking.mockRejectedValue(failure);
        await expect(service.cancel(1, 9)).rejects.toBe(failure);
      });
    });

    // White-box: paths not reached by the black-box cases above.
    describe('white-box paths', () => {
      it('allows cancelling at any time: it reads neither the slot nor its seats', async () => {
        await service.cancel(1, 9);
        expect(repo.lockSlotAndGetStart).not.toHaveBeenCalled();
        expect(repo.findFreeSeatsByTable).not.toHaveBeenCalled();
      });

      it('cancels also after the slot has started', async () => {
        vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
        await expect(service.cancel(1, 9)).resolves.toEqual(cancelled);
      });

      it('compares the owner with the hiker id, not with the user id', async () => {
        // User 1 is hiker 7: a booking of hiker 1 belongs to someone else.
        repo.lockBooking.mockResolvedValue({ hikerId: 1, status: 'CONFIRMED' });
        await expect(service.cancel(1, 9)).rejects.toMatchObject({ code: 'NOT_FOUND' });
        expect(repo.cancelBooking).not.toHaveBeenCalled();
      });

      it('checks the owner before the status: a cancelled booking of another hiker is not found', async () => {
        repo.lockBooking.mockResolvedValue({ hikerId: 8, status: 'CANCELLED' });
        await expect(service.cancel(1, 9)).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: 'Booking not found',
        });
      });

      it('locks and cancels the booking id given by the caller', async () => {
        await service.cancel(1, 42);
        expect(repo.lockBooking).toHaveBeenCalledWith(42);
        expect(repo.cancelBooking).toHaveBeenCalledWith(42);
      });

      it('does not create anything', async () => {
        await service.cancel(1, 9);
        expect(repo.createBooking).not.toHaveBeenCalled();
        expect(repo.createBookingTables).not.toHaveBeenCalled();
      });

      it('propagates a failure of the hiker lookup without locking the booking', async () => {
        const failure = new Error('database down');
        repo.findHikerIdByUserId.mockRejectedValue(failure);
        await expect(service.cancel(1, 9)).rejects.toBe(failure);
        expect(repo.lockBooking).not.toHaveBeenCalled();
      });

      it('propagates a failure of the lock without cancelling', async () => {
        const failure = new Error('lock timeout');
        repo.lockBooking.mockRejectedValue(failure);
        await expect(service.cancel(1, 9)).rejects.toBe(failure);
        expect(repo.cancelBooking).not.toHaveBeenCalled();
      });

      it('throws inside the unit of work, so that it ends and rolls back', async () => {
        repo.lockBooking.mockResolvedValue({ hikerId: 7, status: 'CANCELLED' });
        await expect(service.cancel(1, 9)).rejects.toMatchObject({ code: 'CONFLICT' });
        expect(runStarted).toHaveBeenCalledTimes(1);
        expect(runEnded).toHaveBeenCalledTimes(1);
      });

      it('returns what the repository returns', async () => {
        const other = { id: 9, slotId: 4, partySize: 6, status: 'CANCELLED' as const };
        repo.cancelBooking.mockResolvedValue(other);
        await expect(service.cancel(1, 9)).resolves.toBe(other);
      });
    });
  });
});
