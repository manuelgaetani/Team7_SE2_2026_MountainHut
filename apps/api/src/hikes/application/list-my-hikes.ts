import { Injectable } from '@nestjs/common';
import type { RegisteredHike } from '@mountain-hut/shared';
import { DomainError } from '../../shared-kernel/domain-error.js';
import { HikesRepository } from './hikes.repository.port.js';
import { toRegisteredHike } from './to-registered-hike.js';

// MH-20: the hikes the logged-in hiker has registered, for the personal area. The latest
// departure first.
@Injectable()
export class ListMyHikes {
  constructor(private readonly repo: HikesRepository) {}

  // 403 without a hiker profile, as for the registration.
  async execute(userId: number): Promise<RegisteredHike[]> {
    const hikerId = await this.repo.findHikerIdByUserId(userId);
    if (!hikerId) {
      throw new DomainError('FORBIDDEN', 'A hiker profile is required to see your hikes');
    }
    const hikes = await this.repo.findByHiker(hikerId);
    return hikes.map(toRegisteredHike);
  }
}
