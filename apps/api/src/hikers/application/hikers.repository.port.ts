import type { HikerProfile, NewHikerAccountInput, TemporaryHikerInput } from '@mountain-hut/shared';

// Storage of the hiker profiles. Inside UnitOfWork.run every call joins the transaction.
export abstract class HikersRepository {
  // Hikers whose name, phone or email contains the text, ignoring case for name and email,
  // ordered by name. At most `limit` of them.
  abstract search(text: string, limit: number): Promise<HikerProfile[]>;

  // The hiker chosen by the staff. null if there is none.
  abstract findById(id: number): Promise<HikerProfile | null>;

  // The profile of the account that is logged in. null if the account has no hiker profile.
  abstract findByUserId(userId: number): Promise<HikerProfile | null>;

  // A hiker without an account, who cannot log in.
  abstract createTemporary(input: TemporaryHikerInput): Promise<HikerProfile>;

  // A regular hiker with an account that must change the password at the next login.
  // CONFLICT if the email is already registered.
  abstract createAccount(input: NewHikerAccountInput, passwordHash: string): Promise<HikerProfile>;
}
