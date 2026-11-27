import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { RegisterHikeData } from '@mountain-hut/shared';
import { AppConfig } from '../../config/app-config.js';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { UnitOfWork } from '../../shared-kernel/unit-of-work.js';
import type { Hike } from '../domain/hike.js';
import { HikesRepository } from './hikes.repository.port.js';
import { RegisterHike } from './register-hike.js';

// MH-20: a hiker registers a planned hike before departure (R1, R5, R6, R8).

// 27 November 2026, 15:45 in Rome (UTC+1).
const NOW = new Date('2026-11-27T14:45:00.000Z');

const input = (patch: Partial<RegisterHikeData> = {}): RegisterHikeData => ({
  destination: 'Monte Vettore',
  route: 'From Forca di Presta',
  passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
  departureDate: '2026-11-28',
  departureTime: '08:00',
  returnDate: '2026-11-28',
  returnTime: '17:00',
  ...patch,
});

const stored = (patch: Partial<Hike> = {}): Hike => ({
  id: 12,
  hikerId: 7,
  predefinedHikeId: null,
  destination: 'Monte Vettore',
  route: 'From Forca di Presta',
  passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
  departureAt: '2026-11-28T08:00',
  returnAt: '2026-11-28T17:00',
  ...patch,
});

describe('RegisterHike', () => {
  let useCase: RegisterHike;
  const uow = { run: vi.fn() };
  // Called when the unit of work starts and ends, to tell which calls ran inside it.
  const runStarted = vi.fn();
  const runEnded = vi.fn();
  const order = (fn: Mock) => fn.mock.invocationCallOrder[0];
  const calledInRun = (fn: Mock) => order(fn) > order(runStarted) && order(fn) < order(runEnded);

  const repo = {
    findHikerIdByUserId: vi.fn(),
    predefinedHikeExists: vi.fn(),
    lockHiker: vi.fn(),
    findOverlapping: vi.fn(),
    create: vi.fn(),
  };
  const config = { bookingTimeZone: 'Europe/Rome' };

  beforeEach(async () => {
    vi.resetAllMocks();
    config.bookingTimeZone = 'Europe/Rome';
    uow.run.mockImplementation(async (work: () => Promise<unknown>) => {
      runStarted();
      try {
        return await work();
      } finally {
        runEnded();
      }
    });
    repo.findHikerIdByUserId.mockResolvedValue(7);
    repo.predefinedHikeExists.mockResolvedValue(true);
    repo.lockHiker.mockResolvedValue(undefined);
    repo.findOverlapping.mockResolvedValue(null);
    repo.create.mockImplementation((hike: Omit<Hike, 'id'>) =>
      Promise.resolve({ id: 12, ...hike }),
    );

    const module = await Test.createTestingModule({
      providers: [
        RegisterHike,
        { provide: UnitOfWork, useValue: uow },
        { provide: HikesRepository, useValue: repo },
        { provide: AppConfig, useValue: config },
      ],
    }).compile();
    useCase = module.get(RegisterHike);
  });

  const rejection = async (promise: Promise<unknown>) => {
    const error = await promise.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DomainError);
    return error as DomainError;
  };

  // ---------------------------------------------------------------------------------------
  // Black box: what the story asks, seen from outside.
  // ---------------------------------------------------------------------------------------
  describe('black-box', () => {
    it('registers the hike of the hiker and returns it split into date and time', async () => {
      await expect(useCase.execute(1, input(), NOW)).resolves.toEqual({
        id: 12,
        destination: 'Monte Vettore',
        route: 'From Forca di Presta',
        passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
        departureDate: '2026-11-28',
        departureTime: '08:00',
        returnDate: '2026-11-28',
        returnTime: '17:00',
        predefinedHikeId: null,
      });
    });

    it('saves the hike for the hiker of the logged-in user, with local moments', async () => {
      await useCase.execute(1, input(), NOW);
      expect(repo.findHikerIdByUserId).toHaveBeenCalledWith(1);
      expect(repo.create).toHaveBeenCalledWith({
        hikerId: 7,
        predefinedHikeId: null,
        destination: 'Monte Vettore',
        route: 'From Forca di Presta',
        passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
        departureAt: '2026-11-28T08:00',
        returnAt: '2026-11-28T17:00',
      });
    });

    it('registers a hike without passage points', async () => {
      const res = await useCase.execute(1, input({ passagePoints: [] }), NOW);
      expect(res.passagePoints).toEqual([]);
    });

    describe('hiker profile (R1)', () => {
      it('is forbidden for a user without a hiker profile, and saves nothing', async () => {
        repo.findHikerIdByUserId.mockResolvedValue(null);
        const error = await rejection(useCase.execute(1, input(), NOW));
        expect(error.code).toBe('FORBIDDEN');
        expect(error.message).toBe('A hiker profile is required to register a hike');
        expect(repo.lockHiker).not.toHaveBeenCalled();
        expect(repo.create).not.toHaveBeenCalled();
      });
    });

    describe('departure in the future, hut time (R5)', () => {
      it('accepts a departure one minute after the current local minute', async () => {
        const res = await useCase.execute(
          1,
          input({ departureDate: '2026-11-27', departureTime: '15:46' }),
          NOW,
        );
        expect(res.departureTime).toBe('15:46');
      });

      it.each([
        ['in the current minute', '2026-11-27', '15:45'],
        ['one minute ago', '2026-11-27', '15:44'],
        ['yesterday', '2026-11-26', '18:00'],
      ])('refuses a departure %s with 422, before any query', async (_c, date, time) => {
        const error = await rejection(
          useCase.execute(1, input({ departureDate: date, departureTime: time }), NOW),
        );
        expect(error.code).toBe('UNPROCESSABLE');
        expect(error.message).toBe('The planned departure must be in the future');
        expect(uow.run).not.toHaveBeenCalled();
        expect(repo.findHikerIdByUserId).not.toHaveBeenCalled();
      });

      it('compares with the hut clock, not with UTC', async () => {
        // 14:45 UTC is 15:45 in Rome: 15:30 is still ahead in UTC but already past at the hut.
        const error = await rejection(
          useCase.execute(1, input({ departureDate: '2026-11-27', departureTime: '15:30' }), NOW),
        );
        expect(error.code).toBe('UNPROCESSABLE');
      });

      it('uses the time zone of the configuration', async () => {
        config.bookingTimeZone = 'UTC';
        // 15:30 is ahead of 14:45 UTC.
        await expect(
          useCase.execute(1, input({ departureDate: '2026-11-27', departureTime: '15:30' }), NOW),
        ).resolves.toMatchObject({ departureTime: '15:30' });
      });
    });

    describe('predefined hike (R8)', () => {
      it('keeps the link to the predefined hike it started from', async () => {
        const res = await useCase.execute(1, input({ predefinedHikeId: 2 }), NOW);
        expect(repo.predefinedHikeExists).toHaveBeenCalledWith(2);
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ predefinedHikeId: 2 }));
        expect(res.predefinedHikeId).toBe(2);
      });

      it('saves the values sent, even if they differ from the predefined hike', async () => {
        await useCase.execute(
          1,
          input({ predefinedHikeId: 2, route: 'A changed route', passagePoints: [] }),
          NOW,
        );
        expect(repo.create).toHaveBeenCalledWith(
          expect.objectContaining({ route: 'A changed route', passagePoints: [] }),
        );
      });

      it('does not look for a predefined hike when none is named', async () => {
        await useCase.execute(1, input(), NOW);
        expect(repo.predefinedHikeExists).not.toHaveBeenCalled();
      });

      it('is not found when the predefined hike does not exist, and saves nothing', async () => {
        repo.predefinedHikeExists.mockResolvedValue(false);
        const error = await rejection(useCase.execute(1, input({ predefinedHikeId: 99 }), NOW));
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toBe('Predefined hike not found');
        expect(repo.lockHiker).not.toHaveBeenCalled();
        expect(repo.create).not.toHaveBeenCalled();
      });
    });

    describe('no overlapping hikes (R6)', () => {
      it('looks for overlaps of the same hiker over the new period', async () => {
        await useCase.execute(1, input(), NOW);
        expect(repo.findOverlapping).toHaveBeenCalledWith(
          7,
          '2026-11-28T08:00',
          '2026-11-28T17:00',
        );
      });

      it('is a conflict naming the hike it overlaps, and saves nothing', async () => {
        repo.findOverlapping.mockResolvedValue(
          stored({ id: 3, destination: 'Lago di Pilato', returnAt: '2026-11-29T12:30' }),
        );
        const error = await rejection(useCase.execute(1, input(), NOW));
        expect(error.code).toBe('CONFLICT');
        expect(error.message).toBe(
          'This hike overlaps your hike to Lago di Pilato (2026-11-28 08:00 – 2026-11-29 12:30)',
        );
        expect(repo.create).not.toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------------------------------
  // White box: order of the checks, transaction and lock.
  // ---------------------------------------------------------------------------------------
  describe('white-box', () => {
    it('runs the reads, the lock and the save in one unit of work', async () => {
      await useCase.execute(1, input({ predefinedHikeId: 2 }), NOW);
      expect(uow.run).toHaveBeenCalledTimes(1);
      for (const fn of [
        repo.findHikerIdByUserId,
        repo.predefinedHikeExists,
        repo.lockHiker,
        repo.findOverlapping,
        repo.create,
      ]) {
        expect(calledInRun(fn)).toBe(true);
      }
    });

    it('locks the hiker before looking for overlaps, and saves after both', async () => {
      await useCase.execute(1, input({ predefinedHikeId: 2 }), NOW);
      expect(repo.lockHiker).toHaveBeenCalledWith(7);
      expect(order(repo.findHikerIdByUserId)).toBeLessThan(order(repo.predefinedHikeExists));
      expect(order(repo.predefinedHikeExists)).toBeLessThan(order(repo.lockHiker));
      expect(order(repo.lockHiker)).toBeLessThan(order(repo.findOverlapping));
      expect(order(repo.findOverlapping)).toBeLessThan(order(repo.create));
    });

    it('checks the departure before the hiker profile', async () => {
      repo.findHikerIdByUserId.mockResolvedValue(null);
      const error = await rejection(
        useCase.execute(1, input({ departureDate: '2026-11-27', departureTime: '15:00' }), NOW),
      );
      expect(error.code).toBe('UNPROCESSABLE');
    });

    it('checks the hiker profile before the predefined hike', async () => {
      repo.findHikerIdByUserId.mockResolvedValue(null);
      const error = await rejection(useCase.execute(1, input({ predefinedHikeId: 99 }), NOW));
      expect(error.code).toBe('FORBIDDEN');
      expect(repo.predefinedHikeExists).not.toHaveBeenCalled();
    });

    it('checks the predefined hike before the overlap', async () => {
      repo.predefinedHikeExists.mockResolvedValue(false);
      repo.findOverlapping.mockResolvedValue(stored({ id: 3 }));
      const error = await rejection(useCase.execute(1, input({ predefinedHikeId: 99 }), NOW));
      expect(error.code).toBe('NOT_FOUND');
      expect(repo.findOverlapping).not.toHaveBeenCalled();
    });

    it('treats a hiker id of 0 as no profile', async () => {
      repo.findHikerIdByUserId.mockResolvedValue(0);
      const error = await rejection(useCase.execute(1, input(), NOW));
      expect(error.code).toBe('FORBIDDEN');
    });

    it('propagates a failure of the save, out of the unit of work', async () => {
      const failure = new Error('connection lost');
      repo.create.mockRejectedValue(failure);
      await expect(useCase.execute(1, input(), NOW)).rejects.toBe(failure);
      expect(runEnded).toHaveBeenCalledTimes(1);
    });

    it('returns what the repository saved, not the input', async () => {
      repo.create.mockResolvedValue(stored({ id: 40, destination: 'Stored destination' }));
      const res = await useCase.execute(1, input(), NOW);
      expect(res).toMatchObject({ id: 40, destination: 'Stored destination' });
    });
  });

  // TODO(MH-20-e2e): add Playwright E2E tests of the registration
});
