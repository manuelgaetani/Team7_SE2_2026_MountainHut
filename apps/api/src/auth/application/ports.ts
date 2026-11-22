import type { AuthUser, RegisterInput, Role } from '@mountain-hut/shared';

// A stored account, password hash included: it never leaves the application layer.
export interface UserRecord {
  id: number;
  email: string;
  role: Role;
  passwordHash: string;
  mustChangePassword: boolean;
}

export interface StoredRefreshToken {
  id: number;
  userId: number;
  revokedAt: Date | null;
  expiresAt: Date;
  user: AuthUser;
}

export abstract class UsersRepository {
  // null if no account has the email.
  abstract findByEmail(email: string): Promise<UserRecord | null>;

  // null if the account does not exist.
  abstract findById(id: number): Promise<UserRecord | null>;

  // Creates the account with its hiker profile; the role is the database default.
  // Throws DomainError CONFLICT when the email is already taken.
  abstract createWithHiker(input: RegisterInput, passwordHash: string): Promise<AuthUser>;

  // Replaces the password and ends the forced change (MH-07).
  abstract updatePassword(id: number, passwordHash: string): Promise<void>;
}

// Refresh tokens are stored only as their hash.
export abstract class RefreshTokenRepository {
  abstract create(userId: number, tokenHash: string, expiresAt: Date): Promise<void>;

  // null if no token has the hash.
  abstract findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;

  // Revokes the token only if it is still active, atomically: false if another request
  // revoked it first.
  abstract revokeIfActive(id: number): Promise<boolean>;

  // Revokes every active token of the user.
  abstract revokeAllForUser(userId: number): Promise<void>;

  // Revokes the token with the hash, if it is still active.
  abstract revokeByHash(tokenHash: string): Promise<void>;
}

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;

  // With a null hash it still compares against a dummy hash, so the time taken does not
  // reveal whether the account exists; the result is then false.
  abstract compare(password: string, hash: string | null): Promise<boolean>;
}

export abstract class AccessTokenIssuer {
  abstract sign(user: AuthUser): Promise<string>;
}

export abstract class RefreshTokenGenerator {
  // A new random token and the hash to store.
  abstract generate(): { raw: string; hash: string };

  // The hash under which a token received from the client is stored.
  abstract hash(raw: string): string;
}

// links to reset a forgotten password. Only the hash of the code is stored.
export abstract class PasswordResetTokenRepository {
  abstract create(userId: number, tokenHash: string, expiresAt: Date): Promise<void>;

  // Ends every unused link of the user: only the last one sent works.
  abstract invalidateAllForUser(userId: number): Promise<void>;

  // Uses the link atomically if it is unused and not expired at `now`, and returns its user;
  // null otherwise. Two requests with the same link: only one gets the user.
  abstract consume(tokenHash: string, now: Date): Promise<number | null>;
}

// Sends the email with the reset link. It never throws: a failed email is only recorded.
export abstract class PasswordResetNotifier {
  abstract send(user: { id: number; email: string }, token: string, expiresAt: Date): Promise<void>;
}

// The password of an account created by the staff, read to the hiker over the phone or at
// the desk. The hiker must change it at the next login.
export abstract class PasswordGenerator {
  abstract generate(): string;
}
