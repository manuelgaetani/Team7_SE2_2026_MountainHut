# MH-07 — Reserve for a hiker

|                |                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**     | Complete                                                                                                                                   |
| **Depends on** | MH-58 (authentication), MH-01 (book a table, seat allocation), MH-03 (confirmation email), MH-05 (party requirements), MH-02 (staff roles) |

## User story

**Business value:** 955

As an employee,  
I want to enter a reservation for a hiker,  
so that I can accept reservations via other channels than web.

### Notes

- It is useful when a party of hikers arrives some time before the meal time and asks to reserve some seats, or when someone wants to reserve by phone (or messages).
- The procedure must allow either to quickly enter the name and possibly the phone, or to enter the full details of the hiker, in addition to the reservation details.

### Clarifications

- The hiker can be:
  - already present in the system (can be matched by name, phone or email);
  - missing; in this case it is possible to:
    - enter the full details and create a regular hiker profile that can later use the system web interface;
    - quickly provide minimal info: name and optional phone. This leads to a temporary hiker that is not entitled to log in and operate via web.
- If a full hiker account is created, the password is randomly generated and can be communicated to the hiker, e.g. verbally. The hiker is forced to change the password at the next login; in any case the hiker can recover the password via email.
- There is only one time constraint for employee-made reservations: they cannot be made after the beginning of the time slot.
- The typical expiration time for an email reset link is 24 hours.
- See section 3.8 of the NIST Digital Identity Guidelines for further details.

Team assumptions:

- _Warden:_ the warden can do everything an employee can, so both `EMPLOYEE` and `WARDEN` can search hikers and enter reservations.
- _Status:_ a reservation entered by the staff is `CONFIRMED` at once: the staff take it directly, nobody waits for an email.

## Requirements

| #   | Requirement                                                                                         | Status | Implemented in                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Only the staff (`EMPLOYEE`, `WARDEN`) search hikers and enter reservations                          | Done   | `HikersController`, `StaffBookingsController` (`@Roles('EMPLOYEE', 'WARDEN')`)                                                                 |
| R2  | Find a hiker already in the system by name, phone or email                                          | Done   | `GET /api/hikers`, `SearchHikers`, `PrismaHikersRepository.search`                                                                             |
| R3  | Reservation for a hiker already in the system, with or without an account                           | Done   | `CreateStaffBooking` (`kind: 'EXISTING'`)                                                                                                      |
| R4  | Quick entry: name and optional phone create a temporary hiker, who cannot log in                    | Done   | `temporaryHikerSchema`, `PrismaHikersRepository.createTemporary`                                                                               |
| R5  | Full details create a regular hiker profile, who can later use the web app                          | Done   | `newHikerAccountSchema`, `PrismaHikersRepository.createAccount`                                                                                |
| R6  | The password of a new account is randomly generated and given to the staff, to tell the hiker       | Done   | `CryptoPasswordGenerator`, `StaffBookingResult.generatedPassword`                                                                              |
| R7  | The hiker must change the generated password at the next login                                      | Done   | `users.must_change_password`, `Login`, `GetCurrentUser`, `ChangePassword`                                                                      |
| R8  | The hiker can recover the password by email, with a link valid for 24 hours                         | Done   | `RequestPasswordReset`, `ConfirmPasswordReset`, `passwordResetEmail`                                                                           |
| R9  | The only time limit: no reservation after the beginning of the slot                                 | Done   | `decideStaffBooking`                                                                                                                           |
| R10 | The party is seated with the MH-01 rules; not enough seats refuse the reservation                   | Done   | `decideStaffBooking` (`allocateSeats`)                                                                                                         |
| R11 | A refused reservation stores nothing, not even the new hiker; one active booking per hiker and slot | Done   | `CreateStaffBooking` (one transaction), `bookings_hiker_id_slot_id_active_key`                                                                 |
| R12 | A hiker with an email receives the booking confirmation                                             | Done   | `CreateStaffBooking`, `ConfirmationSender` (MH-03)                                                                                             |
| R13 | Web app: hiker search, reservation form, generated password, forced change and password recovery    | Done   | `StaffBookingPage`, `HikerPicker`, `StaffBookingDoneDialog`, `App` (redirect), `ChangePasswordPage`, `ForgotPasswordPage`, `ResetPasswordPage` |

### Decisions

- **Endpoint.** The staff use `POST /api/staff/bookings`, separate from `POST /api/bookings` (a hiker booking for themselves). The `hiker` field says who the reservation is for: `EXISTING` (a hiker id from the search), `TEMPORARY` (quick entry) or `ACCOUNT` (full details).
- **Time limit.** Only the start of the slot: a slot that has started (`startsAt <= now`) answers `422`. The 2 hours of the online bookings (MH-01) do not apply, so the staff can still take a party that arrives just before the meal.
- **Status and email.** The reservation is `CONFIRMED` at once. A hiker with an email still receives the MH-03 confirmation, as a reminder of date, time and seats (sent after the commit, not awaited, with the MH-03 retries). A temporary hiker has no email, so nothing is sent.
- **Generated password.** 12 characters in 3 groups of 4, like `k7mq-x3tz-9pwa`: lowercase letters and digits without `0`/`o` and `1`/`l`/`i`, which are easy to confuse when read aloud. 31 symbols, so about 59 bits of randomness (`node:crypto`). It always has a letter and a digit, as the password rules want. It is returned only once in the answer and stored only as a bcrypt hash. The hash is computed before the transaction, because bcrypt is slow and the slot stays locked until the commit.
- **Forced change.** A staff-created account has `mustChangePassword: true`. Login, `GET /api/auth/me` and the session refresh report it, and the web app sends the user to the change password page. Changing the password, or setting a new one through a reset link, ends it.
- **Change password.** It needs the current password: a wrong one answers `403` (not `401`, which would make the web app try to refresh a session that is valid). The new password must be different (`422`), so the generated one is really replaced. The other sessions are closed and the user gets a new session.
- **Password recovery.** The answer is always the same, also for an unknown email, and the email is not awaited, so neither the answer nor its timing reveals who is registered. The link is `WEB_URL/reset-password?token=<code>`: 32 random bytes, stored only as SHA-256, valid for 24 hours and only once. A new request spends the previous link. Using the link is atomic, so two requests with the same link change the password only once. It ends a forced change and closes every session of the user.
- **Hiker search.** At least 2 characters. Name and email ignore case, the phone matches any part. `%` and `_` are plain characters, not SQL wildcards. At most 20 hikers, ordered by name and then by id. Staff accounts have no hiker profile, so they are never returned.
- **Phone.** A temporary hiker may have no phone; a hiker with an account must have one (database check `hikers_phone_required_with_account`).
- **Duplicate email.** The unique email of `users` decides, as for the web registration: `409 Email already registered`, also when two staff members enter the same new email at the same time.
- **Concurrency.** Everything runs in one transaction. The slot row is locked first (the MH-01 lock), then the hiker is found or created, the free seats are read and the booking and its tables are stored. Two reservations for the last seats run one after the other, and the refused one is rolled back with its new hiker.
- **Language.** All API messages are in English.

## How it works

### Reservation entered by the staff

1. `POST /api/staff/bookings` arrives with the session cookie. `AuthGuard` checks the session, `RolesGuard` the `EMPLOYEE` or `WARDEN` role, `ZodValidationPipe(createStaffBookingSchema)` the body.
2. For `kind: 'ACCOUNT'`, `CreateStaffBooking` generates the password and hashes it.
3. In one transaction:
   1. locks the slot and computes its start in the hut time zone (`404 Slot not found`);
   2. finds the hiker (`404 Hiker not found`), or creates the temporary hiker, or creates the hiker with an account that must change the password (`409 Email already registered`);
   3. checks that the hiker has no active booking in the slot (`409`);
   4. reads the free seats of the slot and decides with `decideStaffBooking`: `422` if the slot has started, `409` if the party does not fit, otherwise the MH-01 seat allocation;
   5. stores the booking as `CONFIRMED`, its party requirements and its tables.
4. After the commit, if the hiker has an email, the confirmation is sent (MH-03). The answer carries the booking, the hiker and, for a new account, `generatedPassword`.

### First login of a staff-created account

1. The hiker logs in with the generated password: the answer has `mustChangePassword: true`.
2. The hiker sends `POST /api/auth/change-password` with the generated password and a new one.
3. The password is replaced, `must_change_password` becomes `false`, the other sessions are closed and new session cookies are set.

### Password recovery

1. `POST /api/auth/password-reset/request` with the email. If it is registered, the previous links are spent, a new one is stored (hash and expiry) and the email is sent.
2. The hiker opens the link and the web app sends `POST /api/auth/password-reset/confirm` with the code and the new password.
3. The link is spent, the password is replaced, a forced change ends and every session is closed.

## API

### `GET /api/hikers?search=`

Staff only (`EMPLOYEE`, `WARDEN`). Finds hikers by part of the name, phone or email.

| Query    | Type   | Rules                          |
| -------- | ------ | ------------------------------ |
| `search` | string | At least 2 characters, trimmed |

```bash
curl -b cookies.txt 'http://localhost:3000/api/hikers?search=rossi'
```

Response `200 OK` (at most 20 hikers, `[]` when nobody matches):

```json
[
  {
    "id": 15,
    "fullName": "Mario Rossi",
    "email": "mario.rossi@example.com",
    "phone": "+39 333 1234567",
    "notes": null,
    "emergencyContact": null,
    "temporary": false
  },
  {
    "id": 21,
    "fullName": "Anna Rossi",
    "email": null,
    "phone": null,
    "notes": null,
    "emergencyContact": null,
    "temporary": true
  }
]
```

### `POST /api/staff/bookings`

Staff only (`EMPLOYEE`, `WARDEN`). Enters a reservation for a hiker.

| Field          | Type    | Rules                                                                     |
| -------------- | ------- | ------------------------------------------------------------------------- |
| `slotId`       | integer | Positive, at most the largest database integer                            |
| `partySize`    | integer | Positive; the only upper limit is the free seats of the slot              |
| `requirements` | array   | Optional, the MH-05 list: at most 20 `{ allergies, description }` entries |
| `hiker`        | object  | One of the three kinds below, chosen by `kind`                            |

| `hiker.kind` | Other fields                                                                                    | Effect                                         |
| ------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `EXISTING`   | `hikerId` (positive integer, from the search)                                                   | Books for that hiker                           |
| `TEMPORARY`  | `fullName` (with a letter), optional `phone` (7 to 15 digits)                                   | Creates a temporary hiker, who cannot log in   |
| `ACCOUNT`    | `email`, `fullName`, `phone`, optional `notes` and `emergencyContact` (as the web registration) | Creates a hiker with an account and a password |

Quick entry of a party that arrived at the hut:

```bash
curl -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/staff/bookings \
  -d '{
    "slotId": 7,
    "partySize": 4,
    "hiker": { "kind": "TEMPORARY", "fullName": "Luca Bianchi", "phone": "+39 320 1112233" }
  }'
```

Full details of a hiker who reserved by phone:

```bash
curl -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/staff/bookings \
  -d '{
    "slotId": 7,
    "partySize": 2,
    "requirements": [{ "allergies": true, "description": "1 nut allergy" }],
    "hiker": {
      "kind": "ACCOUNT",
      "email": "mario.rossi@example.com",
      "fullName": "Mario Rossi",
      "phone": "+39 333 1234567"
    }
  }'
```

Response `201 Created`. `generatedPassword` is there only for `ACCOUNT`, and only in this answer:

```json
{
  "id": 42,
  "slotId": 7,
  "partySize": 2,
  "status": "CONFIRMED",
  "requirements": [{ "allergies": true, "description": "1 nut allergy" }],
  "tables": [{ "tableNumber": 1, "assignedSeats": 2 }],
  "hiker": {
    "id": 15,
    "fullName": "Mario Rossi",
    "email": "mario.rossi@example.com",
    "phone": "+39 333 1234567",
    "notes": null,
    "emergencyContact": null,
    "temporary": false
  },
  "generatedPassword": "k7mq-x3tz-9pwa"
}
```

### `POST /api/auth/change-password`

Any logged-in user. Body: `currentPassword`, `newPassword` (the password rules of the registration: a letter and a digit). Response `200 OK` with the user (`mustChangePassword: false`) and new session cookies.

```bash
curl -b cookies.txt -c cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/auth/change-password \
  -d '{ "currentPassword": "k7mq-x3tz-9pwa", "newPassword": "MyOwnPassword1" }'
```

### `POST /api/auth/password-reset/request`

Public. Body: `email`. Always `200 OK` with `{ "message": "If the email is registered, a reset link has been sent" }`.

### `POST /api/auth/password-reset/confirm`

Public. Body: `token` (the code of the link, 1 to 200 characters), `password` (the password rules of the registration). Response `200 OK` with `{ "message": "Password changed" }`.

### `mustChangePassword` in the session

`POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/refresh` and `POST /api/auth/change-password` return the user with the new field `mustChangePassword` (`true` for a staff-created account until the hiker sets their own password).

### Errors

| Endpoint                   | Status | When                                                | `message`                                             |
| -------------------------- | ------ | --------------------------------------------------- | ----------------------------------------------------- |
| all                        | `400`  | The query or the body breaks the schema             | `Invalid data`                                        |
| staff, hikers, change      | `401`  | No valid session                                    | `Not authenticated`                                   |
| staff, hikers              | `403`  | The user is a hiker                                 | `Operation not allowed for your role`                 |
| `POST /api/staff/bookings` | `404`  | The slot or the hiker does not exist                | `Slot not found` / `Hiker not found`                  |
| `POST /api/staff/bookings` | `409`  | Not enough free seats                               | `Insufficient seats available for this slot`          |
| `POST /api/staff/bookings` | `409`  | The hiker already has an active booking in the slot | `The hiker already has a booking for this slot`       |
| `POST /api/staff/bookings` | `409`  | The email of a new account is already registered    | `Email already registered`                            |
| `POST /api/staff/bookings` | `422`  | The slot has already started                        | `The slot has already started`                        |
| `change-password`          | `403`  | The current password is wrong                       | `Current password is wrong`                           |
| `change-password`          | `422`  | The new password is the current one                 | `New password must be different from the current one` |
| `password-reset/confirm`   | `422`  | Unknown, used or expired link                       | `The link is invalid or has expired`                  |

## Web app

### New booking (`/staff/bookings/new`)

- **Access.** Only `EMPLOYEE` and `WARDEN` (`isStaff`). An anonymous visitor sees _"Log in with a staff account to enter a booking."_ with a link to `/login`; a hiker sees _"This page is for the hut staff."_ The staff home page links here with **New booking**.
- **1. Hiker** (`HikerPicker`), three tabs:
  - _Existing hiker_: the search box calls `GET /api/hikers?search=` 300 ms after the last key, and only from 2 characters. The matches are listed as cards (_"Select Luca Rossi"_); the selected one shows its phone, email, notes and emergency contact. No match: _"No hiker matches “…”"_.
  - _Quick entry_: full name and optional phone, sent as `kind: 'TEMPORARY'`.
  - _Full profile_: full name, email, mobile number, optional notes and emergency contact, sent as `kind: 'ACCOUNT'`.
- **2. Reservation details.** Date (from today), time slot from `GET /api/slots/schedule?date=` (the slots that have started or have no tables are shown but disabled), number of people and the MH-05 `RequirementsEditor`. A recap shows date, time, people and requirements.
- **Validation.** `createStaffBookingSchema.safeParse` before sending: no hiker selected, an empty requirement, an invalid email or phone are shown as field errors (`role="alert"`, `aria-invalid`) and nothing is sent.
- **Outcome.** `StaffBookingDoneDialog` shows _"Booking created"_ with the hiker, date, time, people and tables. For a new account it shows the generated password once, with the advice to tell it to the hiker now. **Done** empties the form.
- **Errors.** `401` _"The session has expired. Please log in again."_; `403`, `404`, `409` and `422` show the message of the API (e.g. _"Insufficient seats available for this slot"_, _"Email already registered"_, _"The slot has already started"_).

### Forced change (`/change-password`)

- `App` sends a user with `mustChangePassword: true` to `/change-password` from any page, until the password is changed. The page explains that the account was created by the staff and asks for the _Temporary password_ and a _New password_.
- Any logged-in user can also open it to change the password (_Current password_). Anonymous visitors see a link to `/login`.
- `POST /api/auth/change-password`; on success the session user is replaced (`mustChangePassword: false`) and **Continue** goes to the home page. Errors: `403` _"The current password is wrong."_, `422` _"Choose a password different from the current one."_, `401` session expired.

### Password recovery (`/forgot-password`, `/reset-password?token=`)

- The login page links to _"Forgot your password?"_. The page asks for the email and always answers _"If the email is registered, a link has been sent. It is valid for 24 hours."_, so it does not reveal who is registered.
- The link of the email opens `/reset-password?token=<code>`: a new password, sent with the code to `POST /api/auth/password-reset/confirm`. Then _"Your password has been changed. Sign in with the new password."_. A link without a code, or a `422`, shows _"The link is invalid or has expired."_ with a link to ask for a new one.

## Data model

| Table                   | Change                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `hikers`                | `phone` can be `NULL` (temporary hikers); check `hikers_phone_required_with_account` |
| `users`                 | New column `must_change_password` (`BOOLEAN`, default `false`)                       |
| `password_reset_tokens` | New table: the links to set a new password                                           |
| `notification_type`     | New value `PASSWORD_RESET`: the reset emails are recorded in `notifications`         |

`password_reset_tokens`:

| Column       | Type             | Description                                           |
| ------------ | ---------------- | ----------------------------------------------------- |
| `id`         | `SERIAL`         | Primary key                                           |
| `user_id`    | `INTEGER`        | The user; deleted with the user (`ON DELETE CASCADE`) |
| `token_hash` | `TEXT`           | SHA-256 of the code in the link, unique               |
| `expires_at` | `TIMESTAMPTZ(3)` | 24 hours after the request                            |
| `used_at`    | `TIMESTAMPTZ(3)` | When the link was used or spent by a new request      |
| `created_at` | `TIMESTAMPTZ(3)` | When the link was requested                           |

A temporary hiker is a row of `hikers` without `user_id`. A staff reservation is a normal row of `bookings` with status `CONFIRMED`.

Migrations:

- `20261113221557_reserve_for_hiker`
- `20261117180117_password_reset_notification`

## Configuration

| Variable  | Default                 | Purpose                                                       |
| --------- | ----------------------- | ------------------------------------------------------------- |
| `WEB_URL` | `http://localhost:3000` | Address of the web app, used in the links of the reset emails |

`docker compose` passes `WEB_URL` to the application; it must be a URL, and a final `/` is removed.

## Code map

| Path                                                                                  | Content                                                                                      |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `docs/stories/MH-07-reserve-for-a-hiker.md`                                           | This document                                                                                |
| `packages/shared/src/hikers.ts`                                                       | `hikerSearchQuerySchema`, `HikerProfile`, `createStaffBookingSchema` and the hiker kinds     |
| `packages/shared/src/auth.ts`                                                         | Change password and password reset schemas, `PASSWORD_RESET_TTL_HOURS`, `mustChangePassword` |
| `apps/api/src/hikers/hikers.module.ts`                                                | Hikers module; exports the repository to the bookings module                                 |
| `apps/api/src/hikers/presentation/hikers.controller.ts`                               | `GET /api/hikers`, staff only                                                                |
| `apps/api/src/hikers/application/search-hikers.ts`                                    | `SearchHikers`, at most 20 results                                                           |
| `apps/api/src/hikers/application/hikers.repository.port.ts`                           | Search, find, create a temporary hiker or a hiker with an account                            |
| `apps/api/src/hikers/infrastructure/prisma-hikers.repository.ts`                      | Prisma queries; `LIKE` wildcards escaped; duplicate email to `409`                           |
| `apps/api/src/bookings/presentation/staff-bookings.controller.ts`                     | `POST /api/staff/bookings`, staff only                                                       |
| `apps/api/src/bookings/application/create-staff-booking.ts`                           | `CreateStaffBooking`: the transaction of a staff reservation                                 |
| `apps/api/src/bookings/domain/booking-policy.ts`                                      | `decideStaffBooking`: the start of the slot as the only time limit                           |
| `apps/api/src/bookings/application/bookings.repository.port.ts`                       | `status` of a new booking (`CONFIRMED` for the staff)                                        |
| `apps/api/src/bookings/infrastructure/prisma-bookings.repository.ts`                  | Stores the given status                                                                      |
| `apps/api/src/auth/presentation/auth.controller.ts`                                   | `POST /api/auth/change-password`                                                             |
| `apps/api/src/auth/presentation/password-reset.controller.ts`                         | `POST /api/auth/password-reset/request` and `/confirm`                                       |
| `apps/api/src/auth/application/change-password.ts`                                    | `ChangePassword`                                                                             |
| `apps/api/src/auth/application/request-password-reset.ts`                             | `RequestPasswordReset`                                                                       |
| `apps/api/src/auth/application/confirm-password-reset.ts`                             | `ConfirmPasswordReset`                                                                       |
| `apps/api/src/auth/application/ports.ts`                                              | `PasswordGenerator`, `PasswordResetTokenRepository`, `PasswordResetNotifier`                 |
| `apps/api/src/auth/application/login.ts`, `get-current-user.ts`, `refresh-session.ts` | `mustChangePassword` in the session user                                                     |
| `apps/api/src/auth/infrastructure/crypto-password-generator.ts`                       | `CryptoPasswordGenerator`                                                                    |
| `apps/api/src/auth/infrastructure/prisma-password-reset-token.repository.ts`          | Reset links: create, spend the previous ones, use atomically                                 |
| `apps/api/src/auth/infrastructure/prisma-users.repository.ts`                         | New password, end of the forced change                                                       |
| `apps/api/src/notifications/infrastructure/password-reset.adapter.ts`                 | Sends the reset email through the notification service                                       |
| `apps/api/src/notifications/templates/password-reset.ts`                              | `passwordResetEmail`: text and HTML of the reset email                                       |
| `apps/api/src/config/app-config.ts`                                                   | `WEB_URL`                                                                                    |
| `apps/web/src/pages/StaffBookingPage.tsx`                                             | New booking page of the staff: hiker, reservation details, validation and errors             |
| `apps/web/src/components/HikerPicker.tsx`                                             | Existing hiker search, quick entry and full profile tabs                                     |
| `apps/web/src/components/StaffBookingDoneDialog.tsx`                                  | Outcome of the booking and the generated password, shown once                                |
| `apps/web/src/lib/hikerDraft.ts`, `lib/useDebouncedValue.ts`                          | Form state of the hiker; search started when the staff stop typing                           |
| `apps/web/src/api/staffBookings.ts`, `api/useStaffBookings.ts`                        | `GET /api/hikers`, `POST /api/staff/bookings` and their TanStack Query hooks                 |
| `apps/web/src/api/auth.ts`, `api/useAuth.ts`                                          | Change password and password reset requests and hooks                                        |
| `apps/web/src/App.tsx`                                                                | Redirect to `/change-password` while `mustChangePassword` is `true`                          |
| `apps/web/src/pages/ChangePasswordPage.tsx`                                           | Forced change after the first login, and change password for any user                        |
| `apps/web/src/pages/ForgotPasswordPage.tsx`, `pages/ResetPasswordPage.tsx`            | Ask for a reset link; set a new password with the code of the link                           |
| `apps/web/src/router.tsx`                                                             | Routes `staff/bookings/new`, `change-password`, `forgot-password`, `reset-password`          |
| `apps/api/prisma/schema.prisma`                                                       | `mustChangePassword`, `PasswordResetToken`, optional `phone`, `PASSWORD_RESET`               |

## Testing

Run unit tests:

```bash
npm run test -w @mountain-hut/shared
npm run test -w @mountain-hut/api
npm run test -w @mountain-hut/web
```

Run integration tests against PostgreSQL:

```bash
docker compose up -d db
npm run test:int
```

Run end-to-end tests:

```bash
docker compose up --build -d --wait
npm run test:e2e
```

| Spec                                                                                                                                                                        | Covers                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/reserve-for-hiker.int-spec.ts`                                                                                                                               | Real PostgreSQL. Staff reservation: confirmed and seated, temporary hiker without account or email, hashed generated password with forced change, requirements, the start of the slot as the limit, refused reservations store no hiker, duplicate email, rejected bookings, two reservations for the last seats and two new accounts with the same email at the same time. Search, password recovery and change password |
| `e2e/tests/api/reserve-for-hiker.spec.ts`                                                                                                                                   | Running stack and Mailpit. Staff reservation for each kind of hiker, first login and change of the generated password, recovery by email, confirmation email, less than 2 hours before the slot (online `422`, staff `201`), started slot, `409`/`404`/`400`, warden, `401`/`403`. Search, change password, password recovery                                                                                             |
| `packages/shared/src/hikers.spec.ts`                                                                                                                                        | Black box. Search text (2 characters after the trim), quick entry, full profile without password or role, the three hiker kinds, staff booking with the MH-05 requirements                                                                                                                                                                                                                                                |
| `packages/shared/src/auth.spec.ts`                                                                                                                                          | Black box. Change password, reset request and confirm: 8/72 limits, letter and digit, code of 1 to 200 characters, 24 hours                                                                                                                                                                                                                                                                                               |
| `apps/api/src/bookings/domain/booking-policy.spec.ts`                                                                                                                       | Black box of `decideStaffBooking`: the start of the slot as the only limit (1 ms before, exactly at the start, after), inside the 2 hours of MH-01, seats, time checked before seats                                                                                                                                                                                                                                      |
| `apps/api/src/bookings/application/create-staff-booking.spec.ts`                                                                                                            | Black box (R3–R6, R9–R12): each kind of hiker, generated password only for `ACCOUNT`, `404`/`409`/`422` cases, requirements, confirmation email only with an email and not awaited. White box: order of the steps inside one unit of work, hash before the transaction, `CONFIRMED`, email after the commit, the defensive missing-hash branch                                                                            |
| `apps/api/src/bookings/presentation/staff-bookings.controller.spec.ts`                                                                                                      | Black box of `POST /staff/bookings`: `EMPLOYEE`/`WARDEN` `201`, hiker `403`, `400 Invalid data`, every error of the Errors table                                                                                                                                                                                                                                                                                          |
| `apps/api/src/hikers/application/search-hikers.spec.ts`, `presentation/hikers.controller.spec.ts`                                                                           | Black box of the search: at most 20 results, roles, `400` below 2 characters                                                                                                                                                                                                                                                                                                                                              |
| `apps/api/src/hikers/infrastructure/prisma-hikers.repository.spec.ts`                                                                                                       | White box: `OR` on name/phone/email, `%`, `_` and `\` escaped, order by name and id, temporary profiles, `mustChangePassword: true` on new accounts, `P2002` to `409`, other errors rethrown                                                                                                                                                                                                                              |
| `apps/api/src/auth/application/change-password.spec.ts`, `request-password-reset.spec.ts`, `confirm-password.spec.ts`                                                       | Black box: `403` wrong password, `422` same password, nothing changed on refusal, neutral answer for an unknown email, only the hash stored, one use per link, sessions closed                                                                                                                                                                                                                                            |
| `apps/api/src/auth/presentation/password-reset.controller.spec.ts`, `auth.controller.spec.ts`                                                                               | Black box: public reset endpoints, `422` for an invalid link, no cookie on confirm; change password with `AuthGuard`, new cookies, no tokens in the body                                                                                                                                                                                                                                                                  |
| `apps/api/src/auth/application/login.spec.ts`, `get-current-user.spec.ts`, `refresh-session.spec.ts`, `session-issuer.spec.ts`                                              | `mustChangePassword` in the session user, both `false` and `true`                                                                                                                                                                                                                                                                                                                                                         |
| `apps/api/src/auth/infrastructure/crypto-password-generator.spec.ts`                                                                                                        | Black box: `xxxx-xxxx-xxxx`, no `0`/`o`/`1`/`l`/`i`, always a letter and a digit. White box: 12 draws of `randomInt(31)`, mapping, new draw when letters or digits are missing                                                                                                                                                                                                                                            |
| `apps/api/src/auth/infrastructure/prisma-password-reset-token.repository.spec.ts`, `prisma-users.repository.spec.ts`                                                        | White box: conditional `UPDATE` of the link (unused, not expired), no read when no row changed, spending the open links; `updatePassword` ends the forced change                                                                                                                                                                                                                                                          |
| `apps/api/src/notifications/infrastructure/password-reset.adapter.spec.ts`, `notification.service.spec.ts`, `templates/password-reset.spec.ts`, `config/app-config.spec.ts` | Black box: link `WEB_URL/reset-password?token=` with the code encoded, `PASSWORD_RESET` recorded without the link, email content and time zone, `WEB_URL` default, final `/` removed, invalid URL                                                                                                                                                                                                                         |
| `apps/api/src/bookings/infrastructure/prisma-bookings.repository.spec.ts`                                                                                                   | White box: the given status (`CONFIRMED`) is stored instead of `PENDING`                                                                                                                                                                                                                                                                                                                                                  |
| `apps/web/src/pages/StaffBookingPage.test.tsx`                                                                                                                              | Frontend (R13): anonymous and hiker notices, loading, no bookable slot, started and empty slots disabled, search from 2 characters and no match, selection, booking for an existing hiker with requirements, temporary hiker, full profile with the generated password, field errors that send nothing, `409` and `401`                                                                                                   |
| `apps/web/src/pages/ChangePasswordPage.test.tsx`                                                                                                                            | Frontend (R7, R13): anonymous notice, loading, redirect of a staff-created account from any page, password rules, change and continue, `403`, `422`, `401`                                                                                                                                                                                                                                                                |
| `apps/web/src/pages/ForgotPasswordPage.test.tsx`, `pages/ResetPasswordPage.test.tsx`                                                                                        | Frontend (R8, R13): link from the login page, invalid email, same answer for every email, failure; link without a code, password rules, new password with the code, `422` expired link                                                                                                                                                                                                                                    |

### Try it manually

1. Start the stack with `docker compose up --build -d`.
2. Log in as an employee and keep the cookies: `curl -c cookies.txt -H 'Content-Type: application/json' http://localhost:3000/api/auth/login -d '{"email":"<employee email>","password":"<password>"}'`.
3. Find a slot with `curl -b cookies.txt http://localhost:3000/api/slots`, then enter a quick reservation with `POST /api/staff/bookings` (`kind: "TEMPORARY"`): the answer is `201` with `status: "CONFIRMED"` and `temporary: true`.
4. Enter a reservation with full details (`kind: "ACCOUNT"`) and note `generatedPassword`. The confirmation email is in Mailpit at http://localhost:8025.
5. Log in with the new email and the generated password: the answer has `mustChangePassword: true`. Change it with `POST /api/auth/change-password`.
6. Ask for a reset link with `POST /api/auth/password-reset/request`, open the email in Mailpit and send the code of the link to `POST /api/auth/password-reset/confirm`.
7. Search the hikers you created with `GET /api/hikers?search=<part of the name>`.
8. In the browser, log in as an employee at http://localhost:3000/login and choose **New booking**: search a hiker, or use _Quick entry_ or _Full profile_, choose the slot and create the booking. With _Full profile_ the dialog shows the generated password.
9. Log out and log in with the new account: the web app opens _Change password_ and does not let you leave it until the temporary password is replaced.
10. Log out, choose _Forgot your password?_, open the email in Mailpit and follow the link to set a new password.

## Open points

- **Forced change on the server.** The API reports `mustChangePassword` but does not block the other endpoints until the password is changed: the web app enforces it. If the forced change must hold also for API clients, the guard should refuse every endpoint except change password and logout while it is `true`.
