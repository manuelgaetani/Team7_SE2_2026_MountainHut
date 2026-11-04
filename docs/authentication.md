# Authentication

How users register, log in and stay logged in. Code lives in `apps/api/src/auth` (API) and `packages/shared/src/auth.ts` (validation schemas shared by api and web).

## Overview

A hiker registers with email and password, then logs in to get a session made of two tokens, both sent as `httpOnly` cookies:

| Token         | What it is                 | Lifetime                         | Used for                                   |
| ------------- | -------------------------- | -------------------------------- | ------------------------------------------ |
| Access token  | JWT (`HS256`)              | 15 minutes (`JWT_EXPIRES_IN`)    | Proving who the user is on every request   |
| Refresh token | 32 random bytes, base64url | 1 day (`REFRESH_TOKEN_TTL_DAYS`) | Getting a new pair of tokens, nothing else |

Tokens never appear in a response body, so JavaScript in the browser cannot read them. The web app always calls relative URLs (`/api/auth/...`), so the browser attaches the cookies automatically.

### Design decisions

**Accounts**

- Registration does not open a session: the hiker registers, then logs in.
- Every new account is a `HIKER`. A `role` sent by the client is ignored, so nobody can self-register as staff.

**Sessions**

- The refresh token is single use and is rotated on every refresh.
- Presenting a refresh token that was already used revokes all the sessions of that user.
- Logout revokes only the token that was sent, so other devices stay logged in.

**Security**

- A wrong password and an unknown email give the same answer and the same response time.
- Login accepts passwords that no longer satisfy the registration rules, so older passwords keep working if the rules change.
- `GET /api/auth/me` reads the role from the database, not from the token.

**Other**

- API messages are in English.

## Endpoints

All routes are under `/api/auth` and are listed in Swagger at `/api/docs`.

| Method | Route       | Needs                       | Success                             |
| ------ | ----------- | --------------------------- | ----------------------------------- |
| POST   | `/register` | nothing                     | `201` + user                        |
| POST   | `/login`    | nothing                     | `200` + user, sets both cookies     |
| POST   | `/refresh`  | refresh cookie              | `200` + user, sets both cookies     |
| POST   | `/logout`   | nothing                     | `200` `{ "message": "Logged out" }` |
| GET    | `/me`       | access cookie (`AuthGuard`) | `200` + user                        |

### Register

Body, validated by `registerSchema`:

| Field              | Required | Rules                                                                                    |
| ------------------ | -------- | ---------------------------------------------------------------------------------------- |
| `email`            | yes      | Trimmed, lowercased, valid email                                                         |
| `password`         | yes      | At least 8 characters, at most 72 bytes in UTF-8, at least one letter and one digit      |
| `fullName`         | yes      | Trimmed, contains a letter, no NUL byte                                                  |
| `phone`            | yes      | Trimmed, digits, spaces and dashes with an optional leading `+`, 7 to 15 digits in total |
| `notes`            | no       | Trimmed, no NUL byte                                                                     |
| `emergencyContact` | no       | Trimmed, no NUL byte                                                                     |

Unknown fields are ignored.

Why these limits exist:

- **72 bytes**: bcrypt reads only the first 72 bytes, so a longer password would match on its prefix alone.
- **No NUL byte**: PostgreSQL text columns cannot store it.

What the service does:

1. Checks whether the email exists. Emails are compared after normalisation, so `ANNA@Example.IT` and `anna@example.it` are the same account.
2. Hashes the password with bcrypt (cost 10).
3. Creates the `User` and its `Hiker` profile in one operation.

Two simultaneous registrations with the same email give one `201` and one `409`: the unique constraint of the database decides, and the Prisma error `P2002` is translated into a `409`.

Response `201 Created`:

```json
{ "id": 1, "email": "anna@example.it", "role": "HIKER" }
```

### Login

Body, validated by `loginSchema`: `email` and `password`. The password only needs to be non-empty and at most 72 bytes.

On success the response sets two cookies:

| Cookie          | Content            | Attributes                                                                                     |
| --------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `token`         | access token (JWT) | `httpOnly`, `sameSite=lax`, `secure` in production. No `maxAge`: the JWT carries the expiry    |
| `refresh_token` | refresh token      | `httpOnly`, `sameSite=lax`, `secure` in production, `path=/api/auth`, `expires` = token expiry |

The refresh cookie is restricted to `/api/auth`, so the browser sends it only to the authentication routes and not to the rest of the API.

A wrong password and an unknown email are indistinguishable on purpose. The answer is identical, and the service always runs a bcrypt comparison (against a dummy hash if the user does not exist), so the response time does not reveal whether an email is registered.

### Refresh

No body; the browser attaches the refresh cookie. The client should call this route when a protected route answers `401` because the access token has expired, **once**, and then retry the original request.

### Logout

No body. It revokes only the refresh token that was sent and clears both cookies. It always answers `200`, even without a session or with an unknown token.

### Me

Returns the user read from the database, so the `role` is always current even if the token was issued before a role change. If the user no longer exists, the answer is `401`.

## Errors

| Status | When                                                          | `message`                            |
| ------ | ------------------------------------------------------------- | ------------------------------------ |
| `400`  | The body is not valid, including malformed JSON               | `Invalid data` (details in `issues`) |
| `401`  | Wrong password or unknown email                               | `Invalid credentials`                |
| `401`  | Unknown, revoked or already used refresh token                | `Invalid session`                    |
| `401`  | Expired refresh token                                         | `Session expired`                    |
| `401`  | Missing or invalid access token, or the user no longer exists | `Not authenticated`                  |
| `401`  | `/refresh` without a refresh cookie                           | `Not authenticated`                  |
| `409`  | The email is already registered                               | `Email already registered`           |

## Tokens in detail

### Access token

Signed with `HS256` using `JWT_SECRET`. Payload: `{ sub: <user id>, email, role }`.

`AuthGuard` reads the `token` cookie, verifies the signature accepting only `HS256` (this rejects `alg: none` and other algorithms) and sets `req.user = { id, email, role }`. A missing, malformed, expired, forged or tampered token gives `401 Not authenticated`.

### Refresh token

Only its **SHA-256 hash** is stored. SHA-256 is enough, instead of bcrypt, because the token is already random and is looked up by equality.

On every refresh the service does, in order:

1. Looks up the token by its hash. Unknown: `401`.
2. If the token is already revoked, someone is presenting a token that was already rotated, which may mean it was stolen. All active sessions of that user are revoked and the answer is `401`. Other users are not affected.
3. If the token is expired (including "expires exactly now"): `401`.
4. Revokes the token with a conditional update (`revokedAt: null` in the `where`). If two requests use the same token at the same time, only one update matches: one request wins, the other gets `401`.
5. Issues a new access token and a new refresh token.

## Data model

| Model          | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `User`         | Email, password hash and role                                  |
| `Hiker`        | Profile of a hiker: full name, phone, notes, emergency contact |
| `RefreshToken` | SHA-256 hash of the token, owner, `expiresAt` and `revokedAt`  |

Roles are `HIKER`, `EMPLOYEE` and `WARDEN`, defined in `packages/shared/src/auth.ts`. The code never sets the role of a new user: the default of the database (`HIKER`) applies.

## Configuration

| Variable                 | Required | Default | Meaning                                                                           |
| ------------------------ | -------- | ------- | --------------------------------------------------------------------------------- |
| `JWT_SECRET`             | yes      | none    | Signing secret. The API refuses to start without it (`JWT_SECRET is not defined`) |
| `JWT_EXPIRES_IN`         | no       | `15m`   | Lifetime of the access token                                                      |
| `REFRESH_TOKEN_TTL_DAYS` | no       | `1`     | Lifetime of the refresh token, in days. Fractions such as `0.5` are accepted      |

`REFRESH_TOKEN_TTL_DAYS` is validated at startup. A value that is not a positive finite number (`abc`, `0`, `-1`, `Infinity`, `1e300`) makes the API refuse to start, instead of failing at every login.

When you add or change a variable, update `.env.example` and, if Docker needs it, `docker-compose.yml`. Never commit `.env`.

## Protecting a route

`AuthModule` exports `AuthGuard`, and `JwtModule` is registered as global. In another module:

1. Import `AuthModule`.
2. Add `@UseGuards(AuthGuard)` to the controller or handler.
3. Read the user from `req.user`.

```ts
import { AuthGuard } from '../auth/auth.guard.js';

@UseGuards(AuthGuard)
@Get('mine')
mine(@Req() req: Request & { user: { id: number } }) {
  return this.service.findFor(req.user.id);
}
```

Cookies are read with `cookie-parser`, applied by `AuthModule` to all routes. It turns a value starting with `j:` into an object, so the code treats any non-string cookie as "no cookie". A value such as `j:{"a":1}` therefore gives `401` (or `200` on logout), never `500`.

## Code map

| Path                                   | Content                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `packages/shared/src/auth.ts`          | `registerSchema`, `loginSchema`, `Role`, `AuthUser`, shared by api and web |
| `apps/api/src/auth/auth.controller.ts` | Routes, status codes, input validation and cookies                         |
| `apps/api/src/auth/auth.service.ts`    | Hashing, login, token issue and rotation, revocation                       |
| `apps/api/src/auth/auth.guard.ts`      | Verification of the access token                                           |
| `apps/api/src/auth/auth.module.ts`     | JWT configuration and `cookie-parser`                                      |

## Testing

```bash
npm run test -w @mountain-hut/shared
npm run test -w @mountain-hut/api
```

| Spec                                        | Covers                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `packages/shared/src/auth.spec.ts`          | Validation limits                                                                                  |
| `apps/api/src/auth/auth.service.spec.ts`    | Business rules, with a mocked database and JWT service                                             |
| `apps/api/src/auth/auth.controller.spec.ts` | Cookie attributes, route protection, only the user in the body                                     |
| `apps/api/src/auth/auth.guard.spec.ts`      | Forged, expired, tampered, `alg: none` and wrong algorithm tokens                                  |
| `apps/api/src/auth/auth.module.spec.ts`     | Startup configuration and token lifetime                                                           |
| `apps/api/src/auth/auth.flow.spec.ts`       | The whole flow over HTTP with an in-memory database: registration, login, rotation, replay, logout |

## Open points

- **Stale role in the token.** `req.user.role` comes from the token, so it can be out of date for up to `JWT_EXPIRES_IN` after a role change. A route that always needs the current role must read it from the database, as `GET /api/auth/me` does.
- **No role check yet.** `AuthGuard` only checks who the user is. Staff-only routes will need a guard on the role.
- **Staff accounts.** Registration only creates hikers, so `EMPLOYEE` and `WARDEN` accounts can only be created outside the API.
- **No password change or reset.** No endpoint offers it.
- **Italian error message.** See the known issue under [Errors](#errors).
