import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import { MIN_LEAD_MS } from '../domain/booking-policy.js';
import type { BookingsRepository } from './bookings.repository.port.js';
import { CheckAvailability } from './check-availability.js';

const NOW = new Date('2026-11-01T08:00:00Z');
const query = { date: '2026-11-01', time: '12:00', partySize: 6 };

describe('CheckAvailability', () => {
  const repo = { findSlotStartingAt: vi.fn(), findFreeSeatsByTable: vi.fn() };
  const config = { bookingTimeZone: 'Europe/Rome' };
  let useCase: CheckAvailability;

  beforeEach(() => {
    vi.resetAllMocks();
    useCase = new CheckAvailability(repo as unknown as BookingsRepository, config as AppConfig);
  });

  it('answers NO_SLOT, reading no seats, when no upcoming slot starts then', async () => {
    repo.findSlotStartingAt.mockResolvedValue(null);
    await expect(useCase.execute(query, NOW)).resolves.toEqual({
      available: false,
      ...query,
      reason: 'NO_SLOT',
    });
    expect(repo.findSlotStartingAt).toHaveBeenCalledWith('2026-11-01', '12:00', 'Europe/Rome', NOW);
    expect(repo.findFreeSeatsByTable).not.toHaveBeenCalled();
  });

  it('describes how the party would be seated when it fits', async () => {
    repo.findSlotStartingAt.mockResolvedValue({
      id: 4,
      startsAt: new Date(NOW.getTime() + MIN_LEAD_MS),
    });
    repo.findFreeSeatsByTable.mockResolvedValue([
      { tableNumber: 1, freeSeats: 4 },
      { tableNumber: 2, freeSeats: 4 },
    ]);
    const result = await useCase.execute(query, NOW);
    expect(repo.findFreeSeatsByTable).toHaveBeenCalledWith(4);
    expect(result).toMatchObject({ available: true, ...query, totalFreeSeats: 8 });
    expect(result.reason).toBeUndefined();
    expect(result.breakdownText).toBe(`${result.breakdown!.join(' + ')} seats`);
  });

  it('answers INSUFFICIENT_SEATS without a breakdown when the party does not fit', async () => {
    repo.findSlotStartingAt.mockResolvedValue({
      id: 4,
      startsAt: new Date(NOW.getTime() + MIN_LEAD_MS),
    });
    repo.findFreeSeatsByTable.mockResolvedValue([{ tableNumber: 1, freeSeats: 4 }]);
    await expect(useCase.execute(query, NOW)).resolves.toEqual({
      available: false,
      ...query,
      reason: 'INSUFFICIENT_SEATS',
      totalFreeSeats: 4,
    });
  });

  it('answers TOO_LATE but still shows the seats when the slot starts too soon', async () => {
    repo.findSlotStartingAt.mockResolvedValue({
      id: 4,
      startsAt: new Date(NOW.getTime() + MIN_LEAD_MS - 1),
    });
    repo.findFreeSeatsByTable.mockResolvedValue([{ tableNumber: 1, freeSeats: 6 }]);
    await expect(useCase.execute(query, NOW)).resolves.toEqual({
      available: false,
      ...query,
      reason: 'TOO_LATE',
      totalFreeSeats: 6,
      tables: [{ tableNumber: 1, seats: 6 }],
      breakdown: [6],
      breakdownText: '6 seats',
    });
  });
});
