import type { PredefinedHike } from '@mountain-hut/shared';
import type { Hike, LocalMoment, NewHike } from '../domain/hike.js';

// Storage of the registered hikes and of the hut's list. Inside UnitOfWork.run every call joins
// the transaction.
export abstract class HikesRepository {
  // null if the user has no hiker profile.
  abstract findHikerIdByUserId(userId: number): Promise<number | null>;

  // Locks the hiker until the end of the transaction, so two registrations of the same hiker
  // run one after the other and cannot both pass the overlap check.
  abstract lockHiker(hikerId: number): Promise<void>;

  // A hike of the hiker that overlaps the given period, if any (touching periods do not).
  abstract findOverlapping(
    hikerId: number,
    departureAt: LocalMoment,
    returnAt: LocalMoment,
  ): Promise<Hike | null>;

  // False if the hike of the list does not exist.
  abstract predefinedHikeExists(id: number): Promise<boolean>;

  abstract create(hike: NewHike): Promise<Hike>;

  // The hut's list, by destination and route.
  abstract findPredefined(): Promise<PredefinedHike[]>;
}
