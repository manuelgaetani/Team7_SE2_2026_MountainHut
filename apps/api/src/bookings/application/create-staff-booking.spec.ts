import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { CreateStaffBookingInput, HikerProfile } from '@mountain-hut/shared';
import { PasswordGenerator, PasswordHasher } from '../../auth/application/ports.js';
import { AppConfig } from '../../config/app-config.js';
import { HikersRepository } from '../../hikers/application/hikers.repository.port.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { UnitOfWork } from '../../shared-kernel/unit-of-work.js';
import { BookingsRepository } from './bookings.repository.port.js';
import { ConfirmationSender } from './confirmation-sender.js';
import { CreateStaffBooking } from './create-staff-booking.js';

// MH-07: an employee or the warden enters a reservation for a hiker.

const NOW = new Date('2026-11-20T11:00:00.000Z');
// Starts in 30 minutes: too late for an online booking, fine for the staff.
const SOON = new Date('2026-11-20T11:30:00.000Z');

const existingHiker: HikerProfile = {
  id: 7,
  fullName: 'Mario Rossi',
  email: 'mario@example.it',
  phone: '3331234567',
  notes: null,
  emergencyContact: null,
  temporary: false,
};
const temporaryHiker: HikerProfile = {
  ...existingHiker,
  id: 21,
  fullName: 'Luca Bianchi',
  email: null,
  phone: null,
  temporary: true,
};
const newAccountHiker: HikerProfile = { ...existingHiker, id: 30, email: 'anna@example.it' };

const base = { slotId: 3, partySize: 2 };
const forExisting: CreateStaffBookingInput = {
  ...base,
  hiker: { kind: 'EXISTING', hikerId: 7 },
};
const forTemporary: CreateStaffBookingInput = {
  ...base,
  hiker: { kind: 'TEMPORARY', fullName: 'Luca Bianchi' },
};
const forAccount: CreateStaffBookingInput = {
  ...base,
  hiker: {
    kind: 'ACCOUNT',
    email: 'anna@example.it',
    fullName: 'Anna Rossi',
    phone: '3339876543',
  },
};
const stored = { id: 42, slotId: 3, partySize: 2, status: 'CONFIRMED' as const };

describe('CreateStaffBooking', () => {
  let useCase: CreateStaffBooking;
  const uow = { run: vi.fn() };
  // Called when the unit of work starts and ends, to tell which calls ran inside it.
  const runStarted = vi.fn();
  const runEnded = vi.fn();
  const order = (fn: Mock) => fn.mock.invocationCallOrder[0];
  const calledInRun = (fn: Mock) => order(fn) > order(runStarted) && order(fn) < order(runEnded);

  const bookings = {
    lockSlotAndGetStart: vi.fn(),
    hasActiveBooking: vi.fn(),
    findFreeSeatsByTable: vi.fn(),
    createBooking: vi.fn(),
    createBookingTables: vi.fn(),
  };
  const hikers = { findById: vi.fn(), createTemporary: vi.fn(), createAccount: vi.fn() };
  const hasher = { hash: vi.fn(), compare: vi.fn() };
  const generator = { generate: vi.fn() };
  const confirmationSender = { send: vi.fn() };
  const config = { bookingTimeZone: 'Europe/Rome' };

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.setSystemTime(NOW);
    uow.run.mockImplementation(async (work: () => Promise<unknown>) => {
      runStarted();
      try {
        return await work();
      } finally {
        runEnded();
      }
    });
    bookings.lockSlotAndGetStart.mockResolvedValue(SOON);
    bookings.hasActiveBooking.mockResolvedValue(false);
    bookings.findFreeSeatsByTable.mockResolvedValue([
      { tableNumber: 1, freeSeats: 4 },
      { tableNumber: 2, freeSeats: 2 },
    ]);
    bookings.createBooking.mockResolvedValue(stored);
    hikers.findById.mockResolvedValue(existingHiker);
    hikers.createTemporary.mockResolvedValue(temporaryHiker);
    hikers.createAccount.mockResolvedValue(newAccountHiker);
    generator.generate.mockReturnValue('k7mq-x3tz-9pwa');
    hasher.hash.mockResolvedValue('bcrypt-hash');
    confirmationSender.send.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        CreateStaffBooking,
        { provide: UnitOfWork, useValue: uow },
        { provide: BookingsRepository, useValue: bookings },
        { provide: HikersRepository, useValue: hikers },
        { provide: PasswordHasher, useValue: hasher },
        { provide: PasswordGenerator, useValue: generator },
        { provide: ConfirmationSender, useValue: confirmationSender },
        { provide: AppConfig, useValue: config },
      ],
    }).compile();
    useCase = module.get(CreateStaffBooking);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------------------
  // Black box: what the story asks (R3–R6, R9–R12), seen from outside.
  // ---------------------------------------------------------------------------------------
  describe('black-box', () => {
    describe('existing hiker (R3)', () => {
      it('books for the hiker chosen from the search, confirmed at once', async () => {
        const result = await useCase.execute(forExisting, NOW);
        expect(hikers.findById).toHaveBeenCalledWith(7);
        expect(result).toEqual({
          ...stored,
          status: 'CONFIRMED',
          tables: [{ tableNumber: 2, assignedSeats: 2 }],
          requirements: [],
          hiker: existingHiker,
        });
      });

      it('gives no generated password', async () => {
        const result = await useCase.execute(forExisting, NOW);
        expect(result).not.toHaveProperty('generatedPassword');
        expect(generator.generate).not.toHaveBeenCalled();
      });

      it('answers NOT_FOUND for a hiker that does not exist', async () => {
        hikers.findById.mockResolvedValue(null);
        await expect(useCase.execute(forExisting, NOW)).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: 'Hiker not found',
        });
        expect(bookings.createBooking).not.toHaveBeenCalled();
      });

      it('books also for an existing temporary hiker, who has no email', async () => {
        hikers.findById.mockResolvedValue(temporaryHiker);
        const result = await useCase.execute(forExisting, NOW);
        expect(result.hiker.temporary).toBe(true);
        expect(confirmationSender.send).not.toHaveBeenCalled();
      });
    });

    describe('quick entry (R4)', () => {
      it('creates a temporary hiker with the name and the optional phone', async () => {
        await useCase.execute(
          { ...base, hiker: { kind: 'TEMPORARY', fullName: 'Luca Bianchi', phone: '3201112233' } },
          NOW,
        );
        expect(hikers.createTemporary).toHaveBeenCalledWith({
          fullName: 'Luca Bianchi',
          phone: '3201112233',
        });
        expect(hikers.createAccount).not.toHaveBeenCalled();
      });

      it('creates a temporary hiker also without a phone', async () => {
        await useCase.execute(forTemporary, NOW);
        expect(hikers.createTemporary).toHaveBeenCalledWith({
          fullName: 'Luca Bianchi',
          phone: undefined,
        });
      });

      it('books for the new temporary hiker, without password and without email', async () => {
        const result = await useCase.execute(forTemporary, NOW);
        expect(result.hiker).toEqual(temporaryHiker);
        expect(result).not.toHaveProperty('generatedPassword');
        expect(bookings.createBooking).toHaveBeenCalledWith(
          expect.objectContaining({ hikerId: 21 }),
        );
        expect(confirmationSender.send).not.toHaveBeenCalled();
      });
    });

    describe('full profile (R5, R6)', () => {
      it('creates a hiker with an account, with the hash of a generated password', async () => {
        await useCase.execute(forAccount, NOW);
        expect(hasher.hash).toHaveBeenCalledWith('k7mq-x3tz-9pwa');
        expect(hikers.createAccount).toHaveBeenCalledWith(
          {
            email: 'anna@example.it',
            fullName: 'Anna Rossi',
            phone: '3339876543',
            notes: undefined,
            emergencyContact: undefined,
          },
          'bcrypt-hash',
        );
      });

      it('passes notes and emergency contact to the new profile', async () => {
        const hiker = { ...forAccount.hiker, notes: 'vegetarian', emergencyContact: 'Marco' };
        await useCase.execute({ ...base, hiker } as CreateStaffBookingInput, NOW);
        expect(hikers.createAccount).toHaveBeenCalledWith(
          expect.objectContaining({ notes: 'vegetarian', emergencyContact: 'Marco' }),
          'bcrypt-hash',
        );
      });

      it('returns the generated password once, for the staff to tell the hiker', async () => {
        const result = await useCase.execute(forAccount, NOW);
        expect(result.generatedPassword).toBe('k7mq-x3tz-9pwa');
        expect(result.hiker).toEqual(newAccountHiker);
      });

      it('never stores the plain password', async () => {
        await useCase.execute(forAccount, NOW);
        expect(JSON.stringify(hikers.createAccount.mock.calls)).not.toContain('k7mq-x3tz-9pwa');
      });

      it('propagates the CONFLICT of an email already registered and books nothing', async () => {
        hikers.createAccount.mockRejectedValue(
          new DomainError('CONFLICT', 'Email already registered'),
        );
        await expect(useCase.execute(forAccount, NOW)).rejects.toMatchObject({
          code: 'CONFLICT',
        });
        expect(bookings.createBooking).not.toHaveBeenCalled();
      });
    });

    describe('time limit (R9)', () => {
      it('accepts a slot that starts in 30 minutes, inside the 2 hours of MH-01', async () => {
        await expect(useCase.execute(forExisting, NOW)).resolves.toMatchObject({ id: 42 });
      });

      it('accepts a slot that starts one millisecond from now', async () => {
        bookings.lockSlotAndGetStart.mockResolvedValue(new Date(NOW.getTime() + 1));
        await expect(useCase.execute(forExisting, NOW)).resolves.toMatchObject({ id: 42 });
      });

      it.each([
        ['exactly now', NOW],
        ['one minute ago', new Date(NOW.getTime() - 60_000)],
      ])('answers UNPROCESSABLE for a slot that started %s', async (_case, startsAt) => {
        bookings.lockSlotAndGetStart.mockResolvedValue(startsAt);
        await expect(useCase.execute(forExisting, NOW)).rejects.toMatchObject({
          code: 'UNPROCESSABLE',
          message: 'The slot has already started',
        });
        expect(bookings.createBooking).not.toHaveBeenCalled();
      });

      it('uses the current time when none is given', async () => {
        bookings.lockSlotAndGetStart.mockResolvedValue(NOW);
        await expect(useCase.execute(forExisting)).rejects.toMatchObject({
          code: 'UNPROCESSABLE',
        });
      });
    });

    describe('seats (R10)', () => {
      it('seats a party of exactly the free seats over more tables', async () => {
        const result = await useCase.execute({ ...forExisting, partySize: 6 }, NOW);
        expect(result.tables).toEqual([
          { tableNumber: 1, assignedSeats: 4 },
          { tableNumber: 2, assignedSeats: 2 },
        ]);
        expect(bookings.createBookingTables).toHaveBeenCalledWith(42, 3, result.tables);
      });

      it('answers CONFLICT for a party one over the free seats', async () => {
        await expect(useCase.execute({ ...forExisting, partySize: 7 }, NOW)).rejects.toMatchObject({
          code: 'CONFLICT',
          message: 'Insufficient seats available for this slot',
        });
        expect(bookings.createBooking).not.toHaveBeenCalled();
      });
    });

    describe('refused reservations (R11)', () => {
      it('answers NOT_FOUND for a slot that does not exist, before creating any hiker', async () => {
        bookings.lockSlotAndGetStart.mockResolvedValue(null);
        await expect(useCase.execute(forTemporary, NOW)).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: 'Slot not found',
        });
        expect(hikers.createTemporary).not.toHaveBeenCalled();
      });

      it('answers CONFLICT when the hiker already has a booking in the slot', async () => {
        bookings.hasActiveBooking.mockResolvedValue(true);
        await expect(useCase.execute(forExisting, NOW)).rejects.toMatchObject({
          code: 'CONFLICT',
          message: 'The hiker already has a booking for this slot',
        });
        expect(bookings.hasActiveBooking).toHaveBeenCalledWith(7, 3);
        expect(bookings.createBooking).not.toHaveBeenCalled();
      });

      it('sends no email when the reservation is refused', async () => {
        bookings.findFreeSeatsByTable.mockResolvedValue([]);
        await expect(useCase.execute(forExisting, NOW)).rejects.toBeDefined();
        expect(confirmationSender.send).not.toHaveBeenCalled();
      });
    });

    describe('requirements (MH-05)', () => {
      it('stores and returns the requirements of the party', async () => {
        const requirements = [{ restrictions: [], allergies: true, description: '1 nut allergy' }];
        const result = await useCase.execute({ ...forExisting, requirements }, NOW);
        expect(bookings.createBooking).toHaveBeenCalledWith(
          expect.objectContaining({ requirements }),
        );
        expect(result.requirements).toEqual(requirements);
      });

      it('stores an empty list when there are none', async () => {
        await useCase.execute(forExisting, NOW);
        expect(bookings.createBooking).toHaveBeenCalledWith(
          expect.objectContaining({ requirements: [] }),
        );
      });
    });

    describe('confirmation email (R12)', () => {
      it('sends the MH-03 confirmation to a hiker with an email', async () => {
        await useCase.execute(forExisting, NOW);
        expect(confirmationSender.send).toHaveBeenCalledWith(42);
      });

      it('sends it also to a hiker whose account was just created', async () => {
        await useCase.execute(forAccount, NOW);
        expect(confirmationSender.send).toHaveBeenCalledWith(42);
      });

      it('answers without waiting for the email', async () => {
        confirmationSender.send.mockReturnValue(new Promise(() => undefined));
        await expect(useCase.execute(forExisting, NOW)).resolves.toMatchObject({ id: 42 });
      });
    });
  });

  // ---------------------------------------------------------------------------------------
  // White box: how the transaction is built (Decisions: concurrency, generated password).
  // ---------------------------------------------------------------------------------------
  describe('white-box', () => {
    it('locks the slot with the hut time zone, inside the unit of work', async () => {
      config.bookingTimeZone = 'Europe/Zurich';
      await useCase.execute(forExisting, NOW);
      expect(bookings.lockSlotAndGetStart).toHaveBeenCalledWith(3, 'Europe/Zurich');
      expect(uow.run).toHaveBeenCalledOnce();
      config.bookingTimeZone = 'Europe/Rome';
    });

    it('locks the slot first, then the hiker, the seats and the booking, all in the run', async () => {
      await useCase.execute(forTemporary, NOW);
      const steps = [
        bookings.lockSlotAndGetStart,
        hikers.createTemporary,
        bookings.hasActiveBooking,
        bookings.findFreeSeatsByTable,
        bookings.createBooking,
        bookings.createBookingTables,
      ];
      for (const step of steps) expect(calledInRun(step)).toBe(true);
      const orders = steps.map(order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    });

    it('generates and hashes the password before the transaction', async () => {
      await useCase.execute(forAccount, NOW);
      expect(order(generator.generate)).toBeLessThan(order(runStarted));
      expect(order(hasher.hash)).toBeLessThan(order(runStarted));
    });

    it('does not hash anything for an existing or temporary hiker', async () => {
      await useCase.execute(forExisting, NOW);
      await useCase.execute(forTemporary, NOW);
      expect(hasher.hash).not.toHaveBeenCalled();
    });

    it('stores the booking as CONFIRMED with the hiker, the slot and the party', async () => {
      await useCase.execute(forExisting, NOW);
      expect(bookings.createBooking).toHaveBeenCalledWith({
        hikerId: 7,
        slotId: 3,
        partySize: 2,
        requirements: [],
        status: 'CONFIRMED',
      });
    });

    it('sends the email only after the unit of work has ended', async () => {
      await useCase.execute(forExisting, NOW);
      expect(order(confirmationSender.send)).toBeGreaterThan(order(runEnded));
    });

    it('checks the active booking of the new hiker, not of someone else', async () => {
      await useCase.execute(forAccount, NOW);
      expect(bookings.hasActiveBooking).toHaveBeenCalledWith(30, 3);
    });

    it('refuses an ACCOUNT hiker that reaches the run without a password hash', async () => {
      // Defensive branch: the input becomes ACCOUNT only after the hash step was skipped.
      const input: CreateStaffBookingInput = { ...forTemporary };
      bookings.lockSlotAndGetStart.mockImplementation(() => {
        input.hiker = forAccount.hiker;
        return Promise.resolve(SOON);
      });
      await expect(useCase.execute(input, NOW)).rejects.toThrow(
        'Missing password for the new account',
      );
      expect(hikers.createAccount).not.toHaveBeenCalled();
    });
  });
});
