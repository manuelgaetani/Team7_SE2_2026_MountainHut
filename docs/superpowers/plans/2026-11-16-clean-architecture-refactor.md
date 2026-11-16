# Clean Architecture / SOLID Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pay down the architecture/design debt found on `master` (2026-11-16 audit) so the API follows Clean Architecture dependency rules and SOLID, with zero change in HTTP behaviour.

**Architecture:** Each API feature module (`auth`, `bookings`, `slots`, `notifications`) is split into `domain/` (pure TS, no Nest/Prisma), `application/` (use cases + port interfaces as abstract classes used as DI tokens), `infrastructure/` (Prisma/SMTP/bcrypt/JWT adapters), `presentation/` (controllers, guards, pipes, exception filter). Dependencies point inward only; dependency-cruiser enforces it in CI. Web gets small consistency fixes only.

**Tech Stack:** NestJS 11, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, Zod (`@mountain-hut/shared`), Vitest, dependency-cruiser, React + TanStack Query.

**Spec:** the audit findings below (section "Audit findings") are the spec. Every task cites the finding id it fixes.

## Global Constraints

- No HTTP contract change: same routes, status codes, response bodies, error `message` strings, cookie names/paths. Existing e2e (`e2e/tests/api/*`) and int tests (`apps/api/test/*`) must pass unchanged at every commit.
- No DB schema / migration change.
- `domain/` and `application/` must not import `@nestjs/*` (except `@nestjs/common` `Injectable` is NOT allowed in domain; allowed in application only for `@Injectable()`), `../generated/prisma/*`, `express`, `nodemailer`, `bcrypt`, `@nestjs/jwt`.
- Ports are `abstract class` (same pattern as existing `Mailer`), so they work as Nest injection tokens.
- Every task ends green on: `npm run typecheck && npm run lint && npm run depcruise && npm test && npm run test:int`.
- Branch from `master`: `refactor/clean-architecture`. One commit per task, Conventional Commits.
- Commit messages must NOT contain any `Co-Authored-By: Claude` trailer (or any Claude/AI attribution line). Use exactly the `-m` messages given in each task.

## Audit findings (spec)

| Id  | Finding                                                                                                                                                   | Principle        | Where                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| F1  | Services depend on concrete `PrismaService` and call `$transaction`; repositories take `Prisma.TransactionClient` → ORM type leaks into application layer | DIP, Clean Arch  | `bookings.service.ts`, `slots.service.ts`, both repositories                       |
| F2  | Repositories are concrete classes injected directly, no port                                                                                              | DIP              | same                                                                               |
| F3  | Use cases throw Nest HTTP exceptions (`ConflictException`, …) → framework in business layer                                                               | Clean Arch       | all services                                                                       |
| F4  | `AuthService` does user registration, password hashing, JWT issuing, refresh-token persistence and rotation, talks to Prisma directly (no repo)           | SRP, DIP         | `auth/auth.service.ts`                                                             |
| F5  | Prisma error `P2002` checked in two services                                                                                                              | DRY, Clean Arch  | `auth.service.ts`, `slots.service.ts`                                              |
| F6  | `process.env` read in 7 places, some at import time (`DUMMY_HASH`, `refreshTtlMs`)                                                                        | DIP, testability | auth.module/service/controller, mailer, booking-config, prisma.service, app.module |
| F7  | Access-cookie name defined 3 times (`ACCESS_COOKIE`, `ACCESS_TOKEN_COOKIE`, literal `.token` in guard)                                                    | DRY              | auth.controller, swagger.ts, auth.guard                                            |
| F8  | Two `@Controller('slots')` in different modules; hikers' slot list lives in `BookingsService.listSlots`                                                   | SRP, cohesion    | `bookings/slots.controller.ts`, `slots/slots.controller.ts`                        |
| F9  | Overlapping-slot free-seats SQL duplicated; overlap rule (business) encoded only in raw SQL                                                               | DRY              | `bookings.repository.ts` `findUpcomingSlots` / `findFreeSeatsByTable`              |
| F10 | `BookingsRepository` imports `Recipient` / `BookingConfirmationData` from notifications → persistence coupled to email template shape                     | ISP, coupling    | `bookings.repository.ts`                                                           |
| F11 | Booking status union duplicated (`StoredBooking.status`, shared `BookingResult.status`); `MAX_DB_INT` / `isDbId` duplicated                               | DRY              | repo, shared, slots.repository                                                     |
| F12 | `Request & { user: { id: number } }` repeated in controllers; no `@CurrentUser()`                                                                         | DRY              | controllers                                                                        |
| F13 | DB date/time mapping (`toDbDate`, `fromDbTime`) in service; template gets Prisma-shaped `Date` (1970-01-01 UTC)                                           | Clean Arch       | `slots.service.ts`, `booking-confirmation.ts`                                      |
| F14 | Email retry is in-process `setTimeout` fire-and-forget; lost on restart (documented TODO)                                                                 | Reliability debt | `bookings.service.ts`                                                              |
| F15 | Web: `isStaff` duplicated; BookingPage calls `useQuery`/`useMutation` inline while slots use hooks; `apiPost`/`apiPut` duplicated                         | DRY, consistency | `BookingPage.tsx`, `SlotsPage.tsx`, `api/client.ts`                                |

Already good (keep): pure `booking-policy.ts` / `seat-allocation.ts`; `Mailer` abstraction; Zod schemas shared FE/BE; dependency-cruiser in CI; strong test pyramid.

## Review Focus

1. Domain error → HTTP mapping drifts (e.g. TOO_LATE no longer 422, message text changes) → e2e `bookings.spec.ts` must assert status + message for every error; Task 3 adds a filter unit test table covering every `DomainError` code.
2. Transaction boundary lost when a repo is called outside `UnitOfWork.run` → slot lock (`FOR UPDATE`) no longer serializes concurrent bookings; Task 4 keeps `bookings.int-spec.ts` concurrent-booking test and adds one asserting two parallel bookings for last seat → one 201, one 409.
3. Config validated lazily → bad `REFRESH_TOKEN_TTL_DAYS` / missing `JWT_SECRET` should still fail at startup, not at first login; Task 2 test.
4. Refresh-token reuse detection after AuthService split → reused revoked token must still revoke all user sessions; existing `auth.flow.spec.ts` must pass untouched.
5. `GET /slots` (hiker) vs `GET /slots/schedule` & `GET /slots/:id` (staff) after moving controllers → route order must keep `schedule` not captured by `:id`, and hiker still gets 200 on `GET /slots`; Task 6 e2e check.

---

## Target layout (API)

```
apps/api/src/
  config/app-config.ts                      # typed, validated env (F6)
  shared-kernel/
    domain-error.ts                         # DomainError + codes (F3)
    db-ids.ts -> re-export MAX_DB_INT from @mountain-hut/shared (F11)
    unit-of-work.ts                         # port (F1)
  infrastructure/prisma/
    prisma.service.ts, prisma.module.ts     # moved
    prisma-unit-of-work.ts                  # adapter (F1)
    prisma-errors.ts                        # isUniqueViolation (F5)
    db-time.ts                              # toDbDate/fromDbTime... (F13)
  presentation/
    domain-exception.filter.ts              # global (F3)
    current-user.decorator.ts               # (F12)
    zod-validation.pipe.ts, api-zod-body.decorator.ts  # moved from common/
  auth/{domain,application,infrastructure,presentation}/
  bookings/{domain,application,infrastructure,presentation}/
  slots/{domain,application,infrastructure,presentation}/
  notifications/{application,infrastructure}/
```

---

### Task 1: Shared constants, cookie names, CurrentUser decorator (F7, F11, F12)

**Files:**

- Modify: `packages/shared/src/bookings.ts` (export `MAX_DB_INT`, `BookingStatus = 'CONFIRMED' | 'PENDING' | 'REJECTED'`, use in `BookingResult`)
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/auth/presentation/session-cookies.ts` (`ACCESS_COOKIE = 'token'`, `REFRESH_COOKIE = 'refresh_token'`, `REFRESH_PATH = '/api/auth'`)
- Create: `apps/api/src/presentation/current-user.decorator.ts`
- Modify: `auth.controller.ts`, `auth.guard.ts`, `swagger.ts`, `bookings.controller.ts`, `slots.repository.ts`, `bookings.repository.ts`
- Test: `apps/api/src/presentation/current-user.decorator.spec.ts`

**Interfaces:**

- Produces: `interface AuthenticatedUser { id: number; email: string; role: Role }`; `CurrentUser: ParameterDecorator` returning `req.user as AuthenticatedUser`; `type BookingStatus`; `MAX_DB_INT`.

- [ ] **Step 1:** Failing test: `CurrentUser` factory with mocked `ExecutionContext` whose request has `user = {id:7,email:'a@b.c',role:'HIKER'}` returns that object.
- [ ] **Step 2:** `npm test -w @mountain-hut/api -- current-user` → FAIL (module not found).
- [ ] **Step 3:** Implement with `createParamDecorator`. Replace the 3 cookie-name definitions with imports from `session-cookies.ts`; guard reads `req.cookies[ACCESS_COOKIE]`. Replace `isDbId` upper bound and `StoredBooking.status` with shared exports. Controllers use `@CurrentUser() user: AuthenticatedUser`.
- [ ] **Step 4:** Full check command (Global Constraints) → green.
- [ ] **Step 5:** `git commit -m "refactor(api): centralize cookie names, status type and current user"`

### Task 2: Typed AppConfig (F6)

**Files:**

- Create: `apps/api/src/config/app-config.ts`, `apps/api/src/config/config.module.ts` (`@Global`)
- Modify: `auth.module.ts`, `auth.service.ts`, `auth.controller.ts`, `mailer.ts`, `prisma.service.ts`, `common/booking-config.ts` (delete), `bookings.service.ts`
- Test: `apps/api/src/config/app-config.spec.ts`

**Interfaces:**

- Produces: `abstract class AppConfig { jwtSecret: string; jwtExpiresIn: string; refreshTtlMs: number; secureCookies: boolean; bookingTimeZone: string; databaseUrl: string; smtp: SMTPTransport.Options; mailFrom: string }`; `function loadAppConfig(env: Record<string,string|undefined>): AppConfig` (Zod-parsed; throws on invalid). Provided as `{ provide: AppConfig, useFactory: () => loadAppConfig(process.env) }`. `process.env` read only in `config.module.ts` and `app.module.ts` (WEB_DIST_PATH) and `main.ts` (PORT).

- [ ] **Step 1:** Tests: missing `JWT_SECRET` → throws `'JWT_SECRET is not defined'`; `REFRESH_TOKEN_TTL_DAYS='0'` → throws `'REFRESH_TOKEN_TTL_DAYS must be a positive number of days'`; defaults: `jwtExpiresIn '15m'`, `refreshTtlMs 86_400_000`, `bookingTimeZone 'Europe/Rome'`, `secureCookies = NODE_ENV==='production'`; SMTP cases moved from `mail.config.spec.ts`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; reuse `smtpOptionsFromEnv` logic inside `loadAppConfig`. Inject `AppConfig` everywhere listed. `DUMMY_HASH` computed lazily in hasher (Task 7), not at import.
- [ ] **Step 4:** Full check → green. Grep check: `grep -rn "process.env" apps/api/src --include=*.ts | grep -v spec` → only config.module, app.module, main.
- [ ] **Step 5:** `git commit -m "refactor(api): load and validate configuration in one AppConfig"`

### Task 3: Domain errors + global exception filter (F3, F5)

**Files:**

- Create: `apps/api/src/shared-kernel/domain-error.ts`, `apps/api/src/presentation/domain-exception.filter.ts`, `apps/api/src/infrastructure/prisma/prisma-errors.ts`
- Modify: `main.ts` (`app.useGlobalFilters`) — also register in e2e/int test app bootstrap helpers; all services
- Test: `domain-exception.filter.spec.ts`, `prisma-errors.spec.ts`

**Interfaces:**

- Produces: `type DomainErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'UNPROCESSABLE' | 'UNAUTHORIZED'`; `class DomainError extends Error { constructor(code: DomainErrorCode, message: string) }`; `isUniqueViolation(e: unknown): boolean`.
- Mapping: NOT_FOUND→404, CONFLICT→409, FORBIDDEN→403, UNPROCESSABLE→422, UNAUTHORIZED→401. Body identical to Nest default: `{ statusCode, message, error }`.

- [ ] **Step 1:** Table test: each code → status + body `{statusCode, message:'x', error:<Nest reason phrase>}` exactly as `new ConflictException('x').getResponse()` etc.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement filter (`@Catch(DomainError)`). Replace every `throw new XxxException(msg)` in services with `throw new DomainError(code, msg)` (same msg). Replace both `P2002` checks with `isUniqueViolation`.
- [ ] **Step 4:** Full check → green (e2e message assertions unchanged).
- [ ] **Step 5:** `git commit -m "refactor(api): throw domain errors and map them to HTTP in a filter"`

### Task 4: UnitOfWork port + repository ports for slots and bookings (F1, F2, F13)

**Files:**

- Create: `shared-kernel/unit-of-work.ts`, `infrastructure/prisma/prisma-unit-of-work.ts`, `infrastructure/prisma/db-time.ts`
- Create: `slots/application/slots.repository.port.ts`, move impl to `slots/infrastructure/prisma-slots.repository.ts`
- Create: `bookings/application/bookings.repository.port.ts`, move impl to `bookings/infrastructure/prisma-bookings.repository.ts`
- Move: `slots.service.ts` → `slots/application/slots.service.ts`; `bookings.service.ts` → `bookings/application/bookings.service.ts`; `booking-policy.ts`, `seat-allocation.ts` → `bookings/domain/`
- Test: `prisma-unit-of-work.int-spec.ts` (in `apps/api/test/integration/`), update existing service specs to mock ports

**Interfaces:**

- Produces:
  - `abstract class UnitOfWork { abstract run<T>(work: () => Promise<T>): Promise<T> }` — adapter uses `prisma.$transaction` + `AsyncLocalStorage<Prisma.TransactionClient>`; repositories call `this.db()` = ALS store ?? `PrismaService`. Repos no longer take a `tx` argument.
  - `abstract class SlotsRepository { findById(id): Promise<Slot|null>; findByDate(date: string): Promise<Slot[]>; lock(id): Promise<boolean>; findTables(slotId): Promise<SlotTable[]>; create(s: {date: string; startTime: string; endTime: string}): Promise<number>; createTables(slotId, tables: SlotTable[]): Promise<void> }` where `Slot = SlotDetails minus totalSeats` and date/time are `'YYYY-MM-DD'`/`'HH:MM'` strings (conversion via `db-time.ts` inside adapter only).
  - `abstract class BookingsRepository` — same method names as today minus `tx`, minus `findBookingConfirmation` (moves in Task 5).
- Service signatures unchanged.

- [ ] **Step 1:** Int test: inside `uow.run`, repo write then throw → row absent after; nested repo calls see same tx (write then read in same run returns row).
- [ ] **Step 2:** `npm run test:int -w @mountain-hut/api` → FAIL.
- [ ] **Step 3:** Implement adapter; move files; services depend only on `UnitOfWork` + port; module binds `{ provide: SlotsRepository, useClass: PrismaSlotsRepository }`.
- [ ] **Step 4:** Int test for Review Focus #2: two parallel `POST /bookings` for last free seat → exactly one 201, one 409. Full check → green.
- [ ] **Step 5:** `git commit -m "refactor(api): add unit of work and repository ports for slots and bookings"`

### Task 5: Decouple bookings from notifications (F10, F14 first step)

**Files:**

- Create: `bookings/application/booking-confirmation.port.ts`, `notifications/infrastructure/booking-confirmation.adapter.ts`
- Create: `bookings/application/confirmation-sender.ts` (retry loop moved out of `BookingsService`)
- Modify: `bookings.service.ts`, `prisma-bookings.repository.ts`, `booking-confirmation.ts` template (takes strings `date: 'YYYY-MM-DD'`, `startTime/endTime: 'HH:MM'`)
- Test: `confirmation-sender.spec.ts` (move retry tests from `bookings.service.spec.ts`), template spec update

**Interfaces:**

- Produces: `abstract class BookingConfirmationNotifier { abstract notify(bookingId: number): Promise<'SENT'|'FAILED'|'SKIPPED'> }` implemented in notifications (loads recipient + data itself via its own Prisma read). `class ConfirmationSender { send(bookingId: number): Promise<void> }` with `CONFIRMATION_RETRY_DELAYS_MS = [1_000, 5_000, 25_000]` and injectable `sleep(ms)`. `BookingsService.create` calls `void this.confirmationSender.send(id)`.
- `bookings/` no longer imports from `notifications/`; dependency-cruiser rule `bookings-not-to-notifications` added.

- [ ] **Step 1:** Port retry tests: FAILED,FAILED,SENT → confirmBooking called once, sleep called with 1000 then 5000; 4×FAILED → never confirmed; SKIPPED → no retry, not confirmed.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; add depcruise rule.
- [ ] **Step 4:** Full check (incl. `confirmation.int-spec.ts`, e2e `confirmation.spec.ts` via Mailpit) → green.
- [ ] **Step 5:** `git commit -m "refactor(api): move booking confirmation behind a notifier port"`

### Task 6: One `slots` HTTP surface, hiker listing as its own use case (F8, F9)

**Files:**

- Create: `bookings/application/list-bookable-slots.ts` (`ListBookableSlots.execute(now: Date): Promise<SlotSummary[]>`)
- Delete: `bookings/slots.controller.ts`; add `@Get()` (roles: any authenticated, override class `@Roles` with `@Roles('HIKER','EMPLOYEE','WARDEN')`) to `slots/presentation/slots.controller.ts` delegating to `ListBookableSlots` (exported by BookingsModule)
- Modify: `prisma-bookings.repository.ts` — extract shared SQL fragment `bookedSeatsOnTable(tableNumberSql, slotAlias)` via `Prisma.sql`, used by both queries
- Test: `list-bookable-slots.spec.ts`; e2e `slots.spec.ts` + `bookings.spec.ts` unchanged

- [ ] **Step 1:** Unit test: slot starting in 1h → `TOO_LATE`; 0 free → `FULL`; else `AVAILABLE` (moved from `bookings.service.spec.ts`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; route declaration order `@Get()`, `@Get('schedule')`, `@Get(':id')`.
- [ ] **Step 4:** Full check → green; Review Focus #5 verified by e2e (`GET /slots` as HIKER 200, `GET /slots/schedule` as HIKER 403).
- [ ] **Step 5:** `git commit -m "refactor(api): serve all /slots routes from one controller"`

### Task 7: Split AuthService (F4)

**Files:**

- Create: `auth/application/ports.ts` (`UsersRepository`, `RefreshTokenRepository`, `PasswordHasher`, `AccessTokenIssuer`)
- Create: `auth/application/{register-user.ts, login.ts, refresh-session.ts, logout.ts, session-issuer.ts}`
- Create: `auth/infrastructure/{prisma-users.repository.ts, prisma-refresh-token.repository.ts, bcrypt-password-hasher.ts, jwt-access-token-issuer.ts}`
- Delete: `auth/auth.service.ts` (split its spec accordingly)

**Interfaces:**

- `UsersRepository { findByEmail(email): Promise<UserRecord|null>; findById(id): Promise<UserRecord|null>; createWithHiker(input: RegisterInput, passwordHash: string): Promise<AuthUser> /* throws DomainError CONFLICT on unique */ }`
- `RefreshTokenRepository { create(userId, tokenHash, expiresAt); findByHash(hash): Promise<{id,userId,revokedAt,expiresAt,user:AuthUser}|null>; revokeIfActive(id): Promise<boolean>; revokeAllForUser(userId); revokeByHash(hash) }`
- `PasswordHasher { hash(p): Promise<string>; compare(p, hash: string|null): Promise<boolean> /* compares against lazy dummy hash when null */ }`
- `AccessTokenIssuer { sign(user: AuthUser): Promise<string> }`
- `SessionIssuer.issue(user: AuthUser): Promise<AuthSession>` (same `AuthSession` shape as today).

- [ ] **Step 1:** Move existing `auth.service.spec.ts` cases to per-use-case specs with fake ports; keep the reuse-detection case (Review Focus #4) and timing-safe compare case (`compare` called even when user missing).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; `AuthController` injects use cases.
- [ ] **Step 4:** Full check → green; `auth.flow.spec.ts`, e2e `auth.spec.ts` untouched.
- [ ] **Step 5:** `git commit -m "refactor(api): split auth service into use cases and ports"`

### Task 8: Enforce layers in dependency-cruiser

**Files:**

- Modify: `.dependency-cruiser.cjs`

- [ ] **Step 1:** Add rules (severity `error`): `domain-is-pure` (from `^apps/api/src/[^/]+/domain/` to `@nestjs|generated/prisma|express|nodemailer|bcrypt|/application/|/infrastructure/|/presentation/`); `application-not-to-infra` (from `/application/` to `/infrastructure/|/presentation/|generated/prisma`); `presentation-not-to-infra` (from `/presentation/` to `/infrastructure/`).
- [ ] **Step 2:** Prove a rule bites: temporarily import `PrismaService` in `bookings/domain/booking-policy.ts`, `npm run depcruise` → error `domain-is-pure`; revert.
- [ ] **Step 3:** `npm run depcruise` → no violations.
- [ ] **Step 4:** `git commit -m "build: enforce clean architecture layers with dependency-cruiser"`

### Task 9: Web consistency (F15)

**Files:**

- Create: `apps/web/src/api/useBookings.ts` (`useBookableSlots()`, `useCreateBooking()`), `apps/web/src/api/roles.ts` (`isStaff(user?: AuthUser|null): boolean`)
- Modify: `api/client.ts` (private `send<T>(method: 'GET'|'POST'|'PUT', path, body?)`; `apiGet/apiPost/apiPut` become one-liners), `BookingPage.tsx`, `SlotsPage.tsx`
- Test: `api/client.test.ts` (extend), `api/roles.test.ts`

- [ ] **Step 1:** Tests: `isStaff` true for EMPLOYEE/WARDEN, false for HIKER/null; `apiPut` sends method PUT + JSON body and throws `ApiError(409,'msg')` on `{message:'msg'}`.
- [ ] **Step 2:** `npm test -w @mountain-hut/web` → FAIL.
- [ ] **Step 3:** Implement; pages use hooks + `isStaff`.
- [ ] **Step 4:** Full check + `npm run test:e2e` (web specs) → green.
- [ ] **Step 5:** `git commit -m "refactor(web): share booking hooks, staff check and request helper"`

### Out of scope (follow-up stories)

- F14 full fix: notification outbox table + scheduled worker (needs migration; product decision). Task 5 isolates the retry so the swap touches only `ConfirmationSender`.
- MH-02 TODO (overlapping / past slots) — business decision, not refactor.
- Language consistency of comments (IT/EN mix): fix opportunistically while touching files.
