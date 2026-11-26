import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hike } from '../domain/hike.js';
import type { HikesRepository } from './hikes.repository.port.js';
import { ListMyHikes } from './list-my-hikes.js';

const hike = (patch: Partial<Hike> = {}): Hike => ({
  id: 4,
  hikerId: 7,
  predefinedHikeId: 2,
  destination: 'Monte Vettore',
  route: 'From Forca di Presta',
  passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
  departureAt: '2026-11-27T08:00',
  returnAt: '2026-11-28T17:30',
  ...patch,
});

describe('ListMyHikes', () => {
  const repo = { findHikerIdByUserId: vi.fn(), findByHiker: vi.fn() };
  let useCase: ListMyHikes;

  beforeEach(() => {
    vi.resetAllMocks();
    repo.findHikerIdByUserId.mockResolvedValue(7);
    useCase = new ListMyHikes(repo as unknown as HikesRepository);
  });

  it('returns the hikes of the hiker of the user, split into date and time', async () => {
    repo.findByHiker.mockResolvedValue([hike()]);
    await expect(useCase.execute(1)).resolves.toEqual([
      {
        id: 4,
        destination: 'Monte Vettore',
        route: 'From Forca di Presta',
        passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
        departureDate: '2026-11-27',
        departureTime: '08:00',
        returnDate: '2026-11-28',
        returnTime: '17:30',
        predefinedHikeId: 2,
      },
    ]);
    expect(repo.findHikerIdByUserId).toHaveBeenCalledWith(1);
    expect(repo.findByHiker).toHaveBeenCalledWith(7);
  });

  it('keeps the order of the repository and a hike written by hand', async () => {
    repo.findByHiker.mockResolvedValue([hike({ id: 9, predefinedHikeId: null }), hike()]);
    const hikes = await useCase.execute(1);
    expect(hikes.map((h) => h.id)).toEqual([9, 4]);
    expect(hikes[0].predefinedHikeId).toBeNull();
  });

  it('returns an empty list for a hiker without hikes', async () => {
    repo.findByHiker.mockResolvedValue([]);
    await expect(useCase.execute(1)).resolves.toEqual([]);
  });

  it('is forbidden when the user has no hiker profile, without reading the hikes', async () => {
    repo.findHikerIdByUserId.mockResolvedValue(null);
    await expect(useCase.execute(1)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'A hiker profile is required to see your hikes',
    });
    expect(repo.findByHiker).not.toHaveBeenCalled();
  });
});
