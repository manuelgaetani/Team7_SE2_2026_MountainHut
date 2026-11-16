import { Injectable } from '@nestjs/common';
import type { AvailabilityResult, CheckAvailabilityQuery } from '@mountain-hut/shared';
import { AppConfig } from '../../config/app-config.js';
import { checkAvailability, formatBreakdown } from '../domain/booking-policy.js';
import { BookingsRepository } from './bookings.repository.port.js';

// MH-04: anyone can check whether a party fits in the slot starting at a date and time.
@Injectable()
export class CheckAvailability {
  constructor(
    private readonly repo: BookingsRepository,
    private readonly config: AppConfig,
  ) {}

  async execute(query: CheckAvailabilityQuery, now: Date): Promise<AvailabilityResult> {
    const asked = { date: query.date, time: query.time, partySize: query.partySize };
    const slot = await this.repo.findSlotStartingAt(
      query.date,
      query.time,
      this.config.bookingTimeZone,
      now,
    );
    if (!slot) return { available: false, ...asked, reason: 'NO_SLOT' };

    const tables = await this.repo.findFreeSeatsByTable(slot.id);
    const check = checkAvailability({
      startsAt: slot.startsAt,
      now,
      partySize: query.partySize,
      tables,
    });

    const result: AvailabilityResult = {
      available: check.status === 'AVAILABLE',
      ...asked,
      ...(check.status === 'AVAILABLE' ? {} : { reason: check.status }),
      totalFreeSeats: check.freeSeats,
    };
    if (!check.allocation) return result;

    const breakdown = check.allocation.map((a) => a.assignedSeats);
    return {
      ...result,
      tables: check.allocation.map((a) => ({ tableNumber: a.tableNumber, seats: a.assignedSeats })),
      breakdown,
      breakdownText: formatBreakdown(breakdown),
    };
  }
}
