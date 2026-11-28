import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HikeWithHiker } from '../domain/hike.js';
import type { HikesRepository } from './hikes.repository.port.js';
import { ListHikesForStaff } from './list-hikes-for-staff.js';

const anna = {
  id: 7,
  fullName: 'Anna Bianchi',
  email: 'anna@example.test',
  phone: '+39 333 111 2222',
  emergencyContact: 'Marco Bianchi · +39 333 999 8888',
};

const hike = (patch: Partial<HikeWithHiker> = {}): HikeWithHiker => ({
  id: 4,
  hikerId: 7,
  predefinedHikeId: null,
  destination: 'Monte Vettore',
  route: 'From Forca di Presta',
  passagePoints: [],
  departureAt: '2026-11-27T08:00',
  returnAt: '2026-11-27T17:00',
  hiker: anna,
  ...patch,
});

describe('ListHikesForStaff', () => {
  const repo = { findAllWithHiker: vi.fn() };
  let useCase: ListHikesForStaff;

  beforeEach(() => {
    vi.resetAllMocks();
    useCase = new ListHikesForStaff(repo as unknown as HikesRepository);
  });

  it('returns every hike with its hiker, in the order of the repository', async () => {
    const temporary = {
      ...anna,
      id: 9,
      fullName: 'Luca Verdi',
      email: null,
      emergencyContact: null,
    };
    repo.findAllWithHiker.mockResolvedValue([hike({ id: 5, hiker: temporary }), hike()]);

    const hikes = await useCase.execute();

    expect(hikes.map((h) => h.id)).toEqual([5, 4]);
    expect(hikes[1]).toEqual({
      id: 4,
      destination: 'Monte Vettore',
      route: 'From Forca di Presta',
      passagePoints: [],
      departureDate: '2026-11-27',
      departureTime: '08:00',
      returnDate: '2026-11-27',
      returnTime: '17:00',
      predefinedHikeId: null,
      hiker: anna,
    });
    expect(hikes[0].hiker.email).toBeNull();
  });

  it('returns an empty list when no hike is registered', async () => {
    repo.findAllWithHiker.mockResolvedValue([]);
    await expect(useCase.execute()).resolves.toEqual([]);
  });
});
