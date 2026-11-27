import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PredefinedHike } from '@mountain-hut/shared';
import type { HikesRepository } from './hikes.repository.port.js';
import { ListPredefinedHikes } from './list-predefined-hikes.js';
import { toRegisteredHike } from './to-registered-hike.js';

// MH-20 R7: the hut's list of hikes, to start a registration from one of them.

const predefined: PredefinedHike[] = [
  {
    id: 2,
    destination: 'Monte Vettore',
    route: 'From Forca di Presta via Rifugio Zilioli',
    passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
  },
  { id: 3, destination: 'Lago di Pilato', route: 'From Foce', passagePoints: [] },
];

describe('ListPredefinedHikes', () => {
  const repo = { findPredefined: vi.fn() };
  let useCase: ListPredefinedHikes;

  beforeEach(() => {
    vi.resetAllMocks();
    useCase = new ListPredefinedHikes(repo as unknown as HikesRepository);
  });

  it('returns the hut list as the repository gives it', async () => {
    repo.findPredefined.mockResolvedValue(predefined);
    await expect(useCase.execute()).resolves.toEqual(predefined);
    expect(repo.findPredefined).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list when the hut has no predefined hikes', async () => {
    repo.findPredefined.mockResolvedValue([]);
    await expect(useCase.execute()).resolves.toEqual([]);
  });
});

describe('toRegisteredHike', () => {
  it('splits the local moments into date and time and drops the hiker', () => {
    expect(
      toRegisteredHike({
        id: 1,
        hikerId: 7,
        predefinedHikeId: 2,
        destination: 'Monte Vettore',
        route: 'From Forca di Presta',
        passagePoints: ['Forca di Presta'],
        departureAt: '2026-12-31T23:30',
        returnAt: '2027-01-01T00:15',
      }),
    ).toEqual({
      id: 1,
      destination: 'Monte Vettore',
      route: 'From Forca di Presta',
      passagePoints: ['Forca di Presta'],
      departureDate: '2026-12-31',
      departureTime: '23:30',
      returnDate: '2027-01-01',
      returnTime: '00:15',
      predefinedHikeId: 2,
    });
  });
});
