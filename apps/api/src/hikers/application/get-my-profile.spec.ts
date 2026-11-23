import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HikerProfile } from '@mountain-hut/shared';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { GetMyProfile } from './get-my-profile.js';
import type { HikersRepository } from './hikers.repository.port.js';

// The logged-in hiker sees their own profile next to their bookings.

const anna: HikerProfile = {
  id: 1,
  fullName: 'Anna Rossi',
  email: 'anna@example.it',
  phone: null,
  notes: null,
  emergencyContact: null,
  temporary: false,
};

describe('GetMyProfile', () => {
  const hikers = { findByUserId: vi.fn() };
  let getMyProfile: GetMyProfile;

  beforeEach(() => {
    vi.resetAllMocks();
    getMyProfile = new GetMyProfile(hikers as unknown as HikersRepository);
  });

  it('returns the profile of the account, also with missing optional data', async () => {
    hikers.findByUserId.mockResolvedValue(anna);
    await expect(getMyProfile.execute(10)).resolves.toEqual(anna);
    expect(hikers.findByUserId).toHaveBeenCalledWith(10);
  });

  it('answers FORBIDDEN to an account without a hiker profile', async () => {
    hikers.findByUserId.mockResolvedValue(null);
    await expect(getMyProfile.execute(10)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'A hiker profile is required to see your profile',
    });
    await expect(getMyProfile.execute(10)).rejects.toBeInstanceOf(DomainError);
  });

  it('propagates a failure of the repository', async () => {
    hikers.findByUserId.mockRejectedValue(new Error('database down'));
    await expect(getMyProfile.execute(10)).rejects.toThrow('database down');
  });
});
