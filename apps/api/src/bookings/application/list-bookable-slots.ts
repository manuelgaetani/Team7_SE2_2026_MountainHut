import { Injectable } from '@nestjs/common';
import type { SlotSummary } from '@mountain-hut/shared';
import { AppConfig } from '../../config/app-config.js';
import { slotAvailability } from '../domain/booking-policy.js';
import { BookingsRepository } from './bookings.repository.port.js';

// MH-01: the slots a hiker can still book, each marked with its availability.
@Injectable()
export class ListBookableSlots {
  constructor(
    private readonly repo: BookingsRepository,
    private readonly config: AppConfig,
  ) {}

  async execute(now: Date): Promise<SlotSummary[]> {
    const slots = await this.repo.findUpcomingSlots(this.config.bookingTimeZone, now);
    return slots.map(({ startsAt, ...slot }) => ({
      ...slot,
      availability: slotAvailability(startsAt, now, slot.freeSeats),
    }));
  }
}
