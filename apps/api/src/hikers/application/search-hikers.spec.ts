import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HikerProfile } from '@mountain-hut/shared';
import type { HikersRepository } from './hikers.repository.port.js';
import { MAX_HIKER_SEARCH_RESULTS, SearchHikers } from './search-hikers.js';

// MH-07 black box: the staff search a hiker by name, phone or email.

const anna: HikerProfile = {
  id: 1,
  fullName: 'Anna Rossi',
  email: 'anna@example.it',
  phone: '3331234567',
  notes: null,
  emergencyContact: null,
  temporary: false,
};

describe('SearchHikers', () => {
  const hikers = { search: vi.fn() };
  let searchHikers: SearchHikers;

  beforeEach(() => {
    vi.resetAllMocks();
    searchHikers = new SearchHikers(hikers as unknown as HikersRepository);
  });

  it('returns at most 20 hikers', () => {
    expect(MAX_HIKER_SEARCH_RESULTS).toBe(20);
  });

  it('asks the repository for the text with the maximum number of results', async () => {
    hikers.search.mockResolvedValue([anna]);
    await expect(searchHikers.execute('rossi')).resolves.toEqual([anna]);
    expect(hikers.search).toHaveBeenCalledWith('rossi', MAX_HIKER_SEARCH_RESULTS);
  });

  it('returns an empty list when nobody matches', async () => {
    hikers.search.mockResolvedValue([]);
    await expect(searchHikers.execute('nobody')).resolves.toEqual([]);
  });

  it('returns temporary hikers, without email, as the repository gives them', async () => {
    const temporary: HikerProfile = { ...anna, id: 2, email: null, temporary: true };
    hikers.search.mockResolvedValue([anna, temporary]);
    await expect(searchHikers.execute('anna')).resolves.toEqual([anna, temporary]);
  });

  it('propagates a failure of the repository', async () => {
    hikers.search.mockRejectedValue(new Error('database down'));
    await expect(searchHikers.execute('rossi')).rejects.toThrow('database down');
  });
});
