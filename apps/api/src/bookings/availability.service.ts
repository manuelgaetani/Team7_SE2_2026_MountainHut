import { Injectable } from '@nestjs/common';
import type { AvailabilityResult, CheckAvailabilityQuery } from '@mountain-hut/shared';
import { bookingTimeZone } from '../common/booking-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { checkAvailability, formatBreakdown } from './booking-policy.js';
import { BookingsRepository } from './bookings.repository.js';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: BookingsRepository,
  ) {}

  async check(query: CheckAvailabilityQuery, now = new Date()): Promise<AvailabilityResult> {
    const asked = { date: query.date, time: query.time, partySize: query.partySize };
    const slot = await this.repo.findSlotStartingAt(
      this.prisma,
      query.date,
      query.time,
      bookingTimeZone(),
      now,
    );
    if (!slot) return { available: false, ...asked, reason: 'NO_SLOT' };

    const tables = await this.repo.findFreeSeatsByTable(this.prisma, slot.id);
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
