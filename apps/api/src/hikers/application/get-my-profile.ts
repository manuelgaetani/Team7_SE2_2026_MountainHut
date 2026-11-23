import { Injectable } from '@nestjs/common';
import type { HikerProfile } from '@mountain-hut/shared';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { HikersRepository } from './hikers.repository.port.js';

// The profile of the logged-in hiker, shown next to their bookings.
@Injectable()
export class GetMyProfile {
  constructor(private readonly hikers: HikersRepository) {}

  async execute(userId: number): Promise<HikerProfile> {
    const profile = await this.hikers.findByUserId(userId);
    if (!profile) {
      throw new DomainError('FORBIDDEN', 'A hiker profile is required to see your profile');
    }
    return profile;
  }
}
