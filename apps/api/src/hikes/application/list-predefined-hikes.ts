import { Injectable } from '@nestjs/common';
import type { PredefinedHike } from '@mountain-hut/shared';
import { HikesRepository } from './hikes.repository.port.js';

// MH-20: the hut's list of hikes, so the hiker can start from one instead of typing everything
// (issue #49).
@Injectable()
export class ListPredefinedHikes {
  constructor(private readonly repo: HikesRepository) {}

  execute(): Promise<PredefinedHike[]> {
    return this.repo.findPredefined();
  }
}
