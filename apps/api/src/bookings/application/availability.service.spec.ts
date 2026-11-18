import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../../config/app-config.js';
import { MIN_LEAD_MS } from '../domain/booking-policy.js';
import { AvailabilityService } from './availability.service.js';
import { BookingsRepository } from './bookings.repository.port.js';

const NOW = new Date('2026-11-01T10:00:00Z');
const slotStart = new Date(NOW.getTime() + MIN_LEAD_MS);
const query = { date: '2026-11-02', time: '12:00', partySize: 6 };
const asked = { available: false, date: '2026-11-02', time: '12:00', partySize: 6 };
// The slot that includes the time asked: it may start before it (MH-04).
const slotTimes = { startTime: '11:30', endTime: '13:00' };
const threeTablesOfTwo = [
  { tableNumber: 1, freeSeats: 2 },
  { tableNumber: 2, freeSeats: 2 },
  { tableNumber: 3, freeSeats: 2 },
];

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  const config = { bookingTimeZone: 'Europe/Rome' };
  const repo = { findSlotAt: vi.fn(), findFreeSeatsByTable: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    config.bookingTimeZone = 'Europe/Rome';
    vi.setSystemTime(NOW);
    repo.findSlotAt.mockResolvedValue({ id: 9, startsAt: slotStart, ...slotTimes });
    repo.findFreeSeatsByTable.mockResolvedValue(threeTablesOfTwo);
    const module = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: AppConfig, useValue: config },
        { provide: BookingsRepository, useValue: repo },
      ],
    }).compile();
    service = module.get(AvailabilityService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe('when the party fits', () => {
    it('is available, with the seats of each table', async () => {
      await expect(service.check(query)).resolves.toEqual({
        ...asked,
        available: true,
        slot: slotTimes,
        totalFreeSeats: 6,
        tables: [
          { tableNumber: 1, seats: 2 },
          { tableNumber: 2, seats: 2 },
          { tableNumber: 3, seats: 2 },
        ],
        breakdown: [2, 2, 2],
        breakdownText: '2 + 2 + 2 seats',
      });
    });

    it('does not give a reason', async () => {
      await expect(service.check(query)).resolves.not.toHaveProperty('reason');
    });

    it('shows how the party is split over tables of different sizes', async () => {
      repo.findFreeSeatsByTable.mockResolvedValue([
        { tableNumber: 1, freeSeats: 2 },
        { tableNumber: 2, freeSeats: 3 },
        { tableNumber: 3, freeSeats: 1 },
      ]);
      await expect(service.check(query)).resolves.toMatchObject({
        available: true,
        totalFreeSeats: 6,
        breakdown: [3, 2, 1],
        breakdownText: '3 + 2 + 1 seats',
      });
    });

    it('is available for a party exactly as big as the free seats', async () => {
      await expect(service.check({ ...query, partySize: 6 })).resolves.toMatchObject({
        available: true,
      });
    });
  });

  describe('when the seats are not enough', () => {
    it('is not available and gives the free seats, without the seating', async () => {
      const result = await service.check({ ...query, partySize: 7 });
      expect(result).toEqual({
        ...asked,
        partySize: 7,
        reason: 'INSUFFICIENT_SEATS',
        slot: slotTimes,
        totalFreeSeats: 6,
      });
      expect(result).not.toHaveProperty('tables');
      expect(result).not.toHaveProperty('breakdown');
      expect(result).not.toHaveProperty('breakdownText');
    });

    it('is not available for a slot without tables', async () => {
      repo.findFreeSeatsByTable.mockResolvedValue([]);
      await expect(service.check(query)).resolves.toMatchObject({
        available: false,
        reason: 'INSUFFICIENT_SEATS',
        totalFreeSeats: 0,
      });
    });
  });

  describe('when no slot includes that date and time', () => {
    it('is not available with the reason NO_SLOT and reads no seats', async () => {
      repo.findSlotAt.mockResolvedValue(null);
      const result = await service.check(query);
      expect(result).toEqual({ ...asked, reason: 'NO_SLOT' });
      expect(result).not.toHaveProperty('totalFreeSeats');
      expect(result).not.toHaveProperty('slot');
      expect(repo.findFreeSeatsByTable).not.toHaveBeenCalled();
    });
  });

  describe('when it is too late to book online', () => {
    const tooLate = { id: 9, startsAt: new Date(slotStart.getTime() - 1), ...slotTimes };

    it('is not available, but still shows where the party would sit', async () => {
      repo.findSlotAt.mockResolvedValue(tooLate);
      await expect(service.check(query)).resolves.toMatchObject({
        available: false,
        reason: 'TOO_LATE',
        totalFreeSeats: 6,
        breakdown: [2, 2, 2],
        breakdownText: '2 + 2 + 2 seats',
      });
    });

    it('gives no seating when the party does not fit', async () => {
      repo.findSlotAt.mockResolvedValue(tooLate);
      const result = await service.check({ ...query, partySize: 7 });
      expect(result).toMatchObject({ available: false, reason: 'TOO_LATE', totalFreeSeats: 6 });
      expect(result).not.toHaveProperty('tables');
    });

    it('is available for a slot exactly two hours from now', async () => {
      await expect(service.check(query)).resolves.toMatchObject({ available: true });
    });
  });

  it('never suggests alternative slots', async () => {
    const allowed = [
      'available',
      'date',
      'time',
      'partySize',
      'reason',
      // The slot that includes the time asked, not another one.
      'slot',
      'totalFreeSeats',
      'tables',
      'breakdown',
      'breakdownText',
    ];
    for (const partySize of [1, 6, 7]) {
      const result = await service.check({ ...query, partySize });
      expect(Object.keys(result).every((key) => allowed.includes(key))).toBe(true);
    }
  });

  // White-box: tables, breakdown and breakdownText are all built from the same allocation.
  describe('how it builds the seating (white-box)', () => {
    const mixed = [
      { tableNumber: 1, freeSeats: 2 },
      { tableNumber: 2, freeSeats: 3 },
      { tableNumber: 3, freeSeats: 1 },
    ];

    it('keeps tables and breakdown aligned, in the order of the allocation', async () => {
      repo.findFreeSeatsByTable.mockResolvedValue(mixed);
      const result = await service.check(query);
      expect(result.tables).toEqual([
        { tableNumber: 2, seats: 3 },
        { tableNumber: 1, seats: 2 },
        { tableNumber: 3, seats: 1 },
      ]);
      expect(result.breakdown).toEqual(result.tables?.map((t) => t.seats));
      expect(result.breakdownText).toBe('3 + 2 + 1 seats');
    });

    it('seats a small party at one table, the smallest that fits', async () => {
      repo.findFreeSeatsByTable.mockResolvedValue(mixed);
      await expect(service.check({ ...query, partySize: 1 })).resolves.toMatchObject({
        available: true,
        tables: [{ tableNumber: 3, seats: 1 }],
        breakdown: [1],
        breakdownText: '1 seat',
      });
    });

    it('gives the same seating when it is too late, with table numbers too', async () => {
      repo.findSlotAt.mockResolvedValue({ id: 9, startsAt: new Date(NOW.getTime()), ...slotTimes });
      repo.findFreeSeatsByTable.mockResolvedValue(mixed);
      await expect(service.check(query)).resolves.toEqual({
        ...asked,
        reason: 'TOO_LATE',
        slot: slotTimes,
        totalFreeSeats: 6,
        tables: [
          { tableNumber: 2, seats: 3 },
          { tableNumber: 1, seats: 2 },
          { tableNumber: 3, seats: 1 },
        ],
        breakdown: [3, 2, 1],
        breakdownText: '3 + 2 + 1 seats',
      });
    });

    it('does not count the seats of overbooked tables in the free seats', async () => {
      repo.findFreeSeatsByTable.mockResolvedValue([
        { tableNumber: 1, freeSeats: -2 },
        { tableNumber: 2, freeSeats: 4 },
      ]);
      await expect(service.check({ ...query, partySize: 3 })).resolves.toMatchObject({
        available: true,
        totalFreeSeats: 4,
        tables: [{ tableNumber: 2, seats: 3 }],
      });
    });
  });

  describe('how it reads the data', () => {
    it('looks for the slot with the date and time asked, from now', async () => {
      await service.check(query);
      expect(repo.findSlotAt).toHaveBeenCalledWith('2026-11-02', '12:00', 'Europe/Rome', NOW);
    });

    it('gives the start and the end of the slot found, which may start before the time asked', async () => {
      await expect(service.check({ ...query, time: '12:34' })).resolves.toMatchObject({
        time: '12:34',
        slot: { startTime: '11:30', endTime: '13:00' },
      });
    });

    it('gives the slot also when the party does not fit', async () => {
      repo.findFreeSeatsByTable.mockResolvedValue([]);
      await expect(service.check(query)).resolves.toMatchObject({
        reason: 'INSUFFICIENT_SEATS',
        slot: slotTimes,
      });
    });

    it('reads the free seats of the slot found', async () => {
      await service.check(query);
      expect(repo.findFreeSeatsByTable).toHaveBeenCalledWith(9);
    });

    it('uses the time given by the caller instead of the clock', async () => {
      const later = new Date(NOW.getTime() + 60_000);
      await service.check(query, later);
      expect(repo.findSlotAt.mock.calls[0]?.[3]).toBe(later);
    });

    it('uses the configured booking time zone', async () => {
      config.bookingTimeZone = 'UTC';
      await service.check(query);
      expect(repo.findSlotAt.mock.calls[0]?.[2]).toBe('UTC');
    });

    it('propagates the errors of the repository', async () => {
      const failure = new Error('database down');
      repo.findFreeSeatsByTable.mockRejectedValue(failure);
      await expect(service.check(query)).rejects.toBe(failure);
    });
  });
});
