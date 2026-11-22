import { Injectable } from '@nestjs/common';
import type { HikerProfile } from '@mountain-hut/shared';
import { HikersRepository } from './hikers.repository.port.js';

// Enough to choose among people with the same name; the staff type more letters otherwise.
export const MAX_HIKER_SEARCH_RESULTS = 20;

// MH-07: the staff find the hiker of a phone or walk-in reservation by name, phone or email.
@Injectable()
export class SearchHikers {
  constructor(private readonly hikers: HikersRepository) {}

  execute(text: string): Promise<HikerProfile[]> {
    return this.hikers.search(text, MAX_HIKER_SEARCH_RESULTS);
  }
}
