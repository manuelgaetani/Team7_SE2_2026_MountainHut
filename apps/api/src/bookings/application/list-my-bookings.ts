import { Injectable } from '@nestjs/common';
import type { MyBooking } from '@mountain-hut/shared';
import { AppConfig } from '../../config/app-config.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { BookingsRepository } from './bookings.repository.port.js';

// The upcoming bookings of the logged-in hiker, the soonest first.
@Injectable()
export class ListMyBookings {
  constructor(
    private readonly repo: BookingsRepository,
    private readonly config: AppConfig,
  ) {}

  async execute(userId: number, now: Date): Promise<MyBooking[]> {
    const hikerId = await this.repo.findHikerIdByUserId(userId);
    if (!hikerId) {
      throw new DomainError('FORBIDDEN', 'A hiker profile is required to see your bookings');
    }
    return this.repo.findUpcomingBookingsOfHiker(hikerId, this.config.bookingTimeZone, now);
  }
}
