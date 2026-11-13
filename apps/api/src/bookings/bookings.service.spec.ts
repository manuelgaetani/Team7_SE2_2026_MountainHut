import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationService } from '../notifications/notification.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MIN_LEAD_MS } from './booking-policy.js';
import { BookingsRepository } from './bookings.repository.js';
import { BookingsService } from './bookings.service.js';

const NOW = new Date('2026-11-01T10:00:00Z');
const slotStart = new Date(NOW.getTime() + MIN_LEAD_MS);
const input = { slotId: 3, partySize: 2 };
// New bookings are stored as pending: the confirmation email confirms them.
const storedBooking = { id: 9, slotId: 3, partySize: 2, status: 'PENDING' as const };

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
    createBooking: vi.fn(),
    createBookingTables: vi.fn(),
    findBookingConfirmation: vi.fn(),
    confirmBooking: vi.fn(),
    lockBooking: vi.fn(),
    cancelBooking: vi.fn(),
  };
  const notifications = { sendBookingConfirmation: vi.fn() };
  const confirmation = {
    recipient: { userId: 1, email: 'anna@example.com' },
    booking: { bookingId: 9 },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.setSystemTime(NOW);
    prisma.$transaction.mockImplementation((work: (client: typeof tx) => unknown) => work(tx));
    repo.findHikerIdByUserId.mockResolvedValue(7);
    repo.lockSlotAndGetStart.mockResolvedValue(slotStart);
    repo.hasActiveBooking.mockResolvedValue(false);
    repo.findFreeSeatsByTable.mockResolvedValue([{ tableNumber: 1, freeSeats: 4 }]);
    repo.createBooking.mockResolvedValue(storedBooking);
    repo.findBookingConfirmation.mockResolvedValue(confirmation);
    const module = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: BookingsRepository, useValue: repo },
        { provide: NotificationService, useValue: notifications },
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
      expect(repo.findHikerIdByUserId).toHaveBeenCalledWith(tx, 1);
      expect(repo.createBooking).toHaveBeenCalledWith(tx, {
        hikerId: 7,
        slotId: 3,
        partySize: 2,
        requirements: null,
      });
    });

    it('stores the requirements of the party', async () => {
      await service.create(1, { ...input, requirements: 'no nuts' });
      expect(repo.createBooking).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ requirements: 'no nuts' }),
      );
    });

    it('stores empty requirements as none', async () => {
      await service.create(1, { ...input, requirements: '' });
      expect(repo.createBooking).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ requirements: null }),
      );
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
      const bookingOrder = repo.createBooking.mock.invocationCallOrder[0];
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

  describe('confirmation email', () => {
    const sent = () => notifications.sendBookingConfirmation;

    it('is sent to the hiker with the stored booking', async () => {
      await service.create(1, input);
      await vi.waitFor(() =>
        expect(sent()).toHaveBeenCalledWith(confirmation.recipient, confirmation.booking),
      );
      expect(repo.findBookingConfirmation).toHaveBeenCalledWith(prisma, 9);
    });

    it('is read outside the transaction, once it has been committed', async () => {
      let committed = false;
      prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => {
        const result = await work(tx);
        committed = true;
        return result;
      });
      repo.findBookingConfirmation.mockImplementation(() => {
        expect(committed).toBe(true);
        return Promise.resolve(confirmation);
      });
      await service.create(1, input);
      await vi.waitFor(() => expect(sent()).toHaveBeenCalledOnce());
    });

    it('does not make the answer wait for the SMTP server', async () => {
      sent().mockReturnValue(new Promise(() => undefined));
      await expect(service.create(1, input)).resolves.toMatchObject({ id: 9 });
    });

    it('does not fail the booking when it cannot be read', async () => {
      repo.findBookingConfirmation.mockRejectedValue(new Error('database down'));
      await expect(service.create(1, input)).resolves.toMatchObject({ id: 9 });
      await vi.waitFor(() => expect(repo.findBookingConfirmation).toHaveBeenCalled());
      expect(sent()).not.toHaveBeenCalled();
    });

    it('is not sent when the booking has disappeared', async () => {
      repo.findBookingConfirmation.mockResolvedValue(null);
      await service.create(1, input);
      await vi.waitFor(() => expect(repo.findBookingConfirmation).toHaveBeenCalled());
      expect(sent()).not.toHaveBeenCalled();
    });

    it('is not sent when the booking is refused', async () => {
      repo.findFreeSeatsByTable.mockResolvedValue([{ tableNumber: 1, freeSeats: 1 }]);
      await expect(service.create(1, input)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.findBookingConfirmation).not.toHaveBeenCalled();
    });
  });

  describe('confirmation of the booking by the email', () => {
    const sent = () => notifications.sendBookingConfirmation;

    it('confirms the booking once its email is sent', async () => {
      sent().mockResolvedValue('SENT');
      await service.create(1, input);
      await vi.waitFor(() => expect(repo.confirmBooking).toHaveBeenCalledWith(prisma, 9));
      expect(sent()).toHaveBeenCalledOnce();
    });

    it('retries a failed email up to three times, waiting longer each time', async () => {
      vi.useFakeTimers({ now: NOW });
      sent()
        .mockResolvedValueOnce('FAILED')
        .mockResolvedValueOnce('FAILED')
        .mockResolvedValueOnce('FAILED')
        .mockResolvedValueOnce('SENT');
      await service.create(1, input);

      await vi.advanceTimersByTimeAsync(0);
      expect(sent()).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(sent()).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sent()).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(sent()).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(25_000);
      expect(sent()).toHaveBeenCalledTimes(4);
      expect(repo.confirmBooking).toHaveBeenCalledOnce();
    });

    it('confirms the booking when a retry succeeds', async () => {
      vi.useFakeTimers({ now: NOW });
      sent().mockResolvedValueOnce('FAILED').mockResolvedValueOnce('SENT');
      await service.create(1, input);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sent()).toHaveBeenCalledTimes(2);
      expect(repo.confirmBooking).toHaveBeenCalledWith(prisma, 9);
    });

    it('leaves the booking pending after four failed attempts', async () => {
      vi.useFakeTimers({ now: NOW });
      sent().mockResolvedValue('FAILED');
      await service.create(1, input);
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(sent()).toHaveBeenCalledTimes(4);
      expect(repo.confirmBooking).not.toHaveBeenCalled();
    });

    it('neither retries nor confirms when the hiker has no email', async () => {
      vi.useFakeTimers({ now: NOW });
      sent().mockResolvedValue('SKIPPED');
      await service.create(1, input);
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(sent()).toHaveBeenCalledOnce();
      expect(repo.confirmBooking).not.toHaveBeenCalled();
    });

    it('does not resend the email when the booking cannot be confirmed', async () => {
      vi.useFakeTimers({ now: NOW });
      sent().mockResolvedValue('SENT');
      repo.confirmBooking.mockRejectedValue(new Error('database down'));
      await expect(service.create(1, input)).resolves.toMatchObject({ status: 'PENDING' });
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(repo.confirmBooking).toHaveBeenCalledOnce();
      expect(sent()).toHaveBeenCalledOnce();
    });

    it('answers with the booking still pending, before the email is sent', async () => {
      sent().mockReturnValue(new Promise(() => undefined));
      await expect(service.create(1, input)).resolves.toMatchObject({ status: 'PENDING' });
      expect(repo.confirmBooking).not.toHaveBeenCalled();
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
          expect(repo.cancelBooking).toHaveBeenCalledWith(tx, 9);
        },
      );

      it('looks for the hiker of the user, not for the user id', async () => {
        await service.cancel(1, 9);
        expect(repo.findHikerIdByUserId).toHaveBeenCalledWith(tx, 1);
      });

      it('runs every step in one transaction', async () => {
        await service.cancel(1, 9);
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(repo.lockBooking).toHaveBeenCalledWith(tx, 9);
      });

      it('locks the booking before cancelling it', async () => {
        await service.cancel(1, 9);
        expect(repo.lockBooking.mock.invocationCallOrder[0]).toBeLessThan(
          repo.cancelBooking.mock.invocationCallOrder[0]!,
        );
      });

      it('sends no email', async () => {
        await service.cancel(1, 9);
        expect(repo.findBookingConfirmation).not.toHaveBeenCalled();
        expect(notifications.sendBookingConfirmation).not.toHaveBeenCalled();
      });
    });

    describe('when the user has no hiker profile', () => {
      it('answers 403 before touching the booking', async () => {
        repo.findHikerIdByUserId.mockResolvedValue(null);
        await expect(service.cancel(1, 9)).rejects.toBeInstanceOf(ForbiddenException);
        expect(repo.lockBooking).not.toHaveBeenCalled();
        expect(repo.cancelBooking).not.toHaveBeenCalled();
      });
    });

    describe('when the booking cannot be found by the hiker', () => {
      it('answers 404 when the booking does not exist', async () => {
        repo.lockBooking.mockResolvedValue(null);
        await expect(service.cancel(1, 9)).rejects.toThrow(
          new NotFoundException('Booking not found'),
        );
        expect(repo.cancelBooking).not.toHaveBeenCalled();
      });

      it('answers 404, as for a missing booking, when it belongs to another hiker', async () => {
        repo.lockBooking.mockResolvedValue({ hikerId: 8, status: 'CONFIRMED' });
        await expect(service.cancel(1, 9)).rejects.toThrow(
          new NotFoundException('Booking not found'),
        );
        expect(repo.cancelBooking).not.toHaveBeenCalled();
      });
    });

    describe('when the booking is no longer active', () => {
      it.each([
        ['CANCELLED', 'This booking is already cancelled'],
        ['REJECTED', 'A rejected booking cannot be cancelled'],
      ] as const)('answers 409 for a %s booking and writes nothing', async (status, message) => {
        repo.lockBooking.mockResolvedValue({ hikerId: 7, status });
        await expect(service.cancel(1, 9)).rejects.toThrow(new ConflictException(message));
        expect(repo.cancelBooking).not.toHaveBeenCalled();
      });
    });

    describe('when a write fails', () => {
      it('propagates the error so that the transaction rolls back', async () => {
        const failure = new Error('write failed');
        repo.cancelBooking.mockRejectedValue(failure);
        await expect(service.cancel(1, 9)).rejects.toBe(failure);
      });
    });
  });
});
