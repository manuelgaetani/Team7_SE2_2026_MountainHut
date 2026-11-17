import type { HikerProfile } from '@mountain-hut/shared';

// Storage of the hiker profiles. Inside UnitOfWork.run every call joins the transaction.
export abstract class HikersRepository {
  // Hikers whose name, phone or email contains the text, ignoring case for name and email,
  // ordered by name. At most `limit` of them.
  abstract search(text: string, limit: number): Promise<HikerProfile[]>;
}
