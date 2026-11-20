import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { BookingsRepository } from './bookings.repository.port.js';
import { ListMyBookings } from './list-my-bookings.js';

const NOW = new Date('2026-11-15T10:00:00Z');

describe('ListMyBookings', () => {
  const repo = { findHikerIdByUserId: vi.fn(), findUpcomingBookingsOfHiker: vi.fn() };
  const config = { bookingTimeZone: 'Europe/Rome' };
  const mine = [{ id: 9, slotId: 3, date: '2026-11-21', status: 'CONFIRMED' }];
  let useCase: ListMyBookings;

  beforeEach(() => {
    vi.resetAllMocks();
    config.bookingTimeZone = 'Europe/Rome';
    repo.findHikerIdByUserId.mockResolvedValue(7);
    useCase = new ListMyBookings(repo as unknown as BookingsRepository, config as AppConfig);
  });

  it('returns the upcoming bookings of the hiker of the user', async () => {
    repo.findUpcomingBookingsOfHiker.mockResolvedValue(mine);
    await expect(useCase.execute(1, NOW)).resolves.toBe(mine);
    expect(repo.findHikerIdByUserId).toHaveBeenCalledWith(1);
    expect(repo.findUpcomingBookingsOfHiker).toHaveBeenCalledWith(7, 'Europe/Rome', NOW);
  });

  it('uses the configured booking time zone', async () => {
    config.bookingTimeZone = 'Europe/London';
    repo.findUpcomingBookingsOfHiker.mockResolvedValue([]);
    await useCase.execute(1, NOW);
    expect(repo.findUpcomingBookingsOfHiker).toHaveBeenCalledWith(7, 'Europe/London', NOW);
  });

  it('is forbidden when the user has no hiker profile', async () => {
    repo.findHikerIdByUserId.mockResolvedValue(null);
    await expect(useCase.execute(1, NOW)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'A hiker profile is required to see your bookings',
    });
    expect(repo.findUpcomingBookingsOfHiker).not.toHaveBeenCalled();
  });
});
