import { Injectable } from '@nestjs/common';
import type { StaffHike } from '@mountain-hut/shared';
import { HikesRepository } from './hikes.repository.port.js';
import { toRegisteredHike } from './to-registered-hike.js';

// MH-20: the staff see every registered hike with its hiker, so they know who is out and whom to
// call. The latest departure first.
@Injectable()
export class ListHikesForStaff {
  constructor(private readonly repo: HikesRepository) {}

  async execute(): Promise<StaffHike[]> {
    const hikes = await this.repo.findAllWithHiker();
    return hikes.map((hike) => ({ ...toRegisteredHike(hike), hiker: hike.hiker }));
  }
}
