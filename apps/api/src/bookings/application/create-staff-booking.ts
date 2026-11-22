import { Injectable } from '@nestjs/common';
import type {
  CreateStaffBookingInput,
  HikerProfile,
  StaffBookingHiker,
  StaffBookingResult,
} from '@mountain-hut/shared';
import { PasswordGenerator, PasswordHasher } from '../../auth/application/ports.js';
import { AppConfig } from '../../config/app-config.js';
import { HikersRepository } from '../../hikers/application/hikers.repository.port.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { UnitOfWork } from '../../shared-kernel/unit-of-work.js';
import { decideStaffBooking } from '../domain/booking-policy.js';
import { BookingsRepository } from './bookings.repository.port.js';
import { ConfirmationSender } from './confirmation-sender.js';

// An employee or the warden enters a reservation taken by phone or at the desk, for an
// existing hiker, a new temporary hiker or a new regular hiker.
@Injectable()
export class CreateStaffBooking {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly bookings: BookingsRepository,
    private readonly hikers: HikersRepository,
    private readonly passwords: PasswordHasher,
    private readonly passwordGenerator: PasswordGenerator,
    private readonly confirmationSender: ConfirmationSender,
    private readonly config: AppConfig,
  ) {}

  async execute(input: CreateStaffBookingInput, now = new Date()): Promise<StaffBookingResult> {
    // Hashed before the transaction: bcrypt is slow and the slot stays locked until the end.
    const account = input.hiker.kind === 'ACCOUNT' ? await this.newPassword() : null;

    // One transaction: if the booking fails, the new hiker is not stored either.
    const result = await this.uow.run(async () => {
      const startsAt = await this.bookings.lockSlotAndGetStart(
        input.slotId,
        this.config.bookingTimeZone,
      );
      if (!startsAt) throw new DomainError('NOT_FOUND', 'Slot not found');

      const hiker = await this.findOrCreateHiker(input.hiker, account?.hash);
      if (await this.bookings.hasActiveBooking(hiker.id, input.slotId)) {
        throw new DomainError('CONFLICT', 'The hiker already has a booking for this slot');
      }

      const tables = await this.bookings.findFreeSeatsByTable(input.slotId);
      const decision = decideStaffBooking({ startsAt, now, partySize: input.partySize, tables });
      if (!decision.ok) {
        if (decision.reason === 'SLOT_STARTED') {
          throw new DomainError('UNPROCESSABLE', 'The slot has already started');
        }
        throw new DomainError('CONFLICT', 'Insufficient seats available for this slot');
      }

      // Confirmed at once: the staff take the reservation directly, no email is waited for.
      const requirements = input.requirements ?? [];
      const booking = await this.bookings.createBooking({
        hikerId: hiker.id,
        slotId: input.slotId,
        partySize: input.partySize,
        requirements,
        status: 'CONFIRMED',
      });
      await this.bookings.createBookingTables(booking.id, input.slotId, decision.allocation);

      return {
        ...booking,
        tables: decision.allocation,
        requirements,
        hiker,
        ...(account ? { generatedPassword: account.password } : {}),
      };
    });
    // As for the online bookings: a reminder of date, time and
    // seats. A temporary hiker has no email, so nothing is sent.
    if (result.hiker.email) void this.confirmationSender.send(result.id);
    return result;
  }

  private async newPassword(): Promise<{ password: string; hash: string }> {
    const password = this.passwordGenerator.generate();
    return { password, hash: await this.passwords.hash(password) };
  }

  private async findOrCreateHiker(
    hiker: StaffBookingHiker,
    passwordHash: string | undefined,
  ): Promise<HikerProfile> {
    switch (hiker.kind) {
      case 'EXISTING': {
        const found = await this.hikers.findById(hiker.hikerId);
        if (!found) throw new DomainError('NOT_FOUND', 'Hiker not found');
        return found;
      }
      case 'TEMPORARY':
        return this.hikers.createTemporary({ fullName: hiker.fullName, phone: hiker.phone });
      case 'ACCOUNT':
        // The hash is computed in execute for every ACCOUNT request, before the transaction.
        if (passwordHash === undefined) throw new Error('Missing password for the new account');
        return this.hikers.createAccount(
          {
            email: hiker.email,
            fullName: hiker.fullName,
            phone: hiker.phone,
            notes: hiker.notes,
            emergencyContact: hiker.emergencyContact,
          },
          passwordHash,
        );
    }
  }
}
