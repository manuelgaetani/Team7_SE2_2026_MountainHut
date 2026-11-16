import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import { MIN_LEAD_MS } from '../domain/booking-policy.js';
import type { BookingsRepository } from './bookings.repository.port.js';
import { ListBookableSlots } from './list-bookable-slots.js';

const NOW = new Date('2026-11-01T10:00:00Z');
const slotStart = new Date(NOW.getTime() + MIN_LEAD_MS);

describe('ListBookableSlots', () => {
  const repo = { findUpcomingSlots: vi.fn() };
  const config = { bookingTimeZone: 'Europe/Rome' };
  const visible = { id: 1, date: '2026-11-01', startTime: '20:00', endTime: '22:00', freeSeats: 4 };
  const slot = { ...visible, startsAt: slotStart };
  let useCase: ListBookableSlots;

  beforeEach(() => {
    vi.resetAllMocks();
    useCase = new ListBookableSlots(repo as unknown as BookingsRepository, config as AppConfig);
  });

  it('reads the slots in the booking time zone', async () => {
    repo.findUpcomingSlots.mockResolvedValue([]);
    await expect(useCase.execute(NOW)).resolves.toEqual([]);
    expect(repo.findUpcomingSlots).toHaveBeenCalledWith('Europe/Rome', NOW);
  });

  it('marks each slot with its availability and hides the raw start', async () => {
    repo.findUpcomingSlots.mockResolvedValue([
      slot,
      { ...slot, id: 2, freeSeats: 0 },
      { ...slot, id: 3, startsAt: new Date(slotStart.getTime() - 1) },
    ]);
    await expect(useCase.execute(NOW)).resolves.toEqual([
      { ...visible, availability: 'AVAILABLE' },
      { ...visible, id: 2, freeSeats: 0, availability: 'FULL' },
      { ...visible, id: 3, availability: 'TOO_LATE' },
    ]);
  });
});
