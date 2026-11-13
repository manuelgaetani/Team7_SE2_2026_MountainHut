import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AvailabilityService } from './availability.service.js';
import { MIN_LEAD_MS } from './booking-policy.js';
import { BookingsRepository } from './bookings.repository.js';

const NOW = new Date('2026-11-01T10:00:00Z');
const slotStart = new Date(NOW.getTime() + MIN_LEAD_MS);
const query = { date: '2026-11-02', time: '12:00', partySize: 6 };
const asked = { available: false, date: '2026-11-02', time: '12:00', partySize: 6 };
const threeTablesOfTwo = [
  { tableNumber: 1, freeSeats: 2 },
  { tableNumber: 2, freeSeats: 2 },
  { tableNumber: 3, freeSeats: 2 },
];

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  const prisma = { marker: 'prisma' };
  const repo = { findSlotStartingAt: vi.fn(), findFreeSeatsByTable: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.setSystemTime(NOW);
    repo.findSlotStartingAt.mockResolvedValue({ id: 9, startsAt: slotStart });
    repo.findFreeSeatsByTable.mockResolvedValue(threeTablesOfTwo);
    const module = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: PrismaService, useValue: prisma },
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

  describe('when no slot starts at that date and time', () => {
    it('is not available with the reason NO_SLOT and reads no seats', async () => {
      repo.findSlotStartingAt.mockResolvedValue(null);
      const result = await service.check(query);
      expect(result).toEqual({ ...asked, reason: 'NO_SLOT' });
      expect(result).not.toHaveProperty('totalFreeSeats');
      expect(repo.findFreeSeatsByTable).not.toHaveBeenCalled();
    });
  });

  describe('when it is too late to book online', () => {
    const tooLate = { id: 9, startsAt: new Date(slotStart.getTime() - 1) };

    it('is not available, but still shows where the party would sit', async () => {
      repo.findSlotStartingAt.mockResolvedValue(tooLate);
      await expect(service.check(query)).resolves.toMatchObject({
        available: false,
        reason: 'TOO_LATE',
        totalFreeSeats: 6,
        breakdown: [2, 2, 2],
        breakdownText: '2 + 2 + 2 seats',
      });
    });

    it('gives no seating when the party does not fit', async () => {
      repo.findSlotStartingAt.mockResolvedValue(tooLate);
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

  describe('how it reads the data', () => {
    it('looks for the slot with the date and time asked, from now', async () => {
      await service.check(query);
      expect(repo.findSlotStartingAt).toHaveBeenCalledWith(
        prisma,
        '2026-11-02',
        '12:00',
        'Europe/Rome',
        NOW,
      );
    });

    it('reads the free seats of the slot found', async () => {
      await service.check(query);
      expect(repo.findFreeSeatsByTable).toHaveBeenCalledWith(prisma, 9);
    });

    it('uses the time given by the caller instead of the clock', async () => {
      const later = new Date(NOW.getTime() + 60_000);
      await service.check(query, later);
      expect(repo.findSlotStartingAt.mock.calls[0]?.[4]).toBe(later);
    });

    it('uses the configured booking time zone', async () => {
      vi.stubEnv('BOOKING_TIMEZONE', 'UTC');
      await service.check(query);
      expect(repo.findSlotStartingAt.mock.calls[0]?.[3]).toBe('UTC');
    });

    it('propagates the errors of the repository', async () => {
      const failure = new Error('database down');
      repo.findFreeSeatsByTable.mockRejectedValue(failure);
      await expect(service.check(query)).rejects.toBe(failure);
    });
  });
});
