# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Detailed notes for each release are in [docs/release-notes](docs/release-notes/).

## [Unreleased]

### Added

- Menus of the slots (MH-10): `PUT /api/slots/:id/menu` (staff only) creates or replaces the menu of a slot, a free text of 1 to 5000 characters with basic formatting as a small Markdown subset (`**bold**`, `*italic*`, `- item`, `  - sub item`), stored as written. `GET /api/slots/:id/menu` (any logged-in role) returns it, `404` if the slot has no menu. `GET /api/menus` (staff only) lists the menus already written, each text once with its latest slot, to reuse and change one. New table `menus` (migration `slot_menus`): one menu per slot, deleted with its slot.
- Menu changes only before the slot (MH-10, new clarifications): `PUT /api/slots/:id/menu` answers `422` once the slot has started (its date and start time in the hut time zone), so the menus of past slots stay fixed. New `DELETE /api/slots/:id/menu` (staff only) deletes the menu of a slot that has not started (`204`; `422` once started; `404` if the slot has no menu). Each slot keeps its own copy of a reused menu, so changing or deleting it affects only that slot. The messages are in `MENU_ERRORS` of the shared package.
- Web app (MH-10): the menu editor on Time slots and the menu card on Book a table use the menu endpoints instead of the browser storage. The courses and dishes are written into the menu text in a fixed Markdown layout (`## course`, `### dish · € price`, English name, `Marks:`, description) and read back; any other text is shown as formatted free text. The editor checks the 5000-character limit before saving.
- Web app, menus only before the slot (MH-10): on Time slots a slot that has started shows **See menu** (the preview) instead of **Define menu** or **Edit menu**, or no menu button without a menu. **Delete menu** in the editor deletes the menu of a future slot, after asking. Removing a course or a dish, discarding changes and deleting the menu ask in a popup above the editor (`ConfirmDialog`), which cannot be used until the question is answered. The editor shows the API's `422` message when the slot starts while it is open. The web API client sends `DELETE` requests (`apiDelete`).

## [release-1] - 2026-11-23

Details in [docs/release-notes/release-1.md](docs/release-notes/release-1.md).

### Added

- Release deployment without the repository: `docker-compose.release.yml` runs the published image `ghcr.io/manuelgaetani/team7_se2_2026_mountainhut:release-1` with PostgreSQL and Mailpit. It needs only this file and a `.env` with `JWT_SECRET` (and the `SMTP_*` settings for real emails).
- Demo data on the first start: the container runs `node dist/seed.js --on-start` after the migrations. With `SEED_DEMO_DATA=true` (set by `docker-compose.release.yml`) and a database without users, it creates the demo accounts and 14 days of slots; a database that already has users is left as it is. The development `docker-compose.yml` does not set it, so the development and CI stacks start empty.
- Demo accounts for every role: `employee@mountainhut.com`, `employee2@mountainhut.com` (employees), `warden@mountainhut.com` (warden) and `hiker@mountainhut.com` (hiker), all with the password `Password123!`.
- Party requirements (MH-05): a booking has a list of requirements, each with an `allergies` flag and a description (e.g. `1 vegan, peanut allergy`), for subsets of the party. `POST /api/bookings` accepts `requirements` (optional, at most 20 entries, each description trimmed, 1 to 500 characters); the answer and `GET /api/bookings/me` return them in the order entered.
- The confirmation email lists the requirements, one line per entry, and marks the ones with allergies with `Allergies (special care needed)` (MH-05).
- Database (MH-05): new table `party_requirements`, deleted with its booking (migration `party_requirements`). Each old free-text requirement becomes one entry flagged as an allergy, and the column `bookings.requirements` is dropped.
- Web app (MH-05): on the booking page the hiker can add, edit and remove requirement rows, each with an "Allergies" checkbox; the confirmation dialog lists them and marks the ones with allergies.
- Documentation of MH-05 in [docs/stories](docs/stories/MH-05-provide-party-requirements.md).
- Availability check (MH-04): public endpoint `GET /api/availability?date=&time=&partySize=`, no login required. `time` can be any time inside a slot: the slot that includes it is checked (start included, end excluded), and the answer gives its start and end in `slot`. The answer tells whether the party fits and, when it does, how it would be seated (e.g. `2 + 2 + 2 seats`), with the same seat allocation as a booking. No alternative slots are suggested.
- When the party does not fit or cannot be booked, the availability check gives a reason: `NO_SLOT` (no slot starts at that time, or it has already started), `INSUFFICIENT_SEATS`, or `TOO_LATE` (less than 2 hours before the start: not bookable online, but the free seats and the seat split are still shown, since the staff can still take the reservation).
- Reservation entered by the staff (MH-07): `POST /api/staff/bookings` (employees and warden) books for a hiker already in the system, for a new temporary hiker (name and optional phone, who cannot log in) or for a new hiker with an account, whose password is generated and returned only once. The reservation is `CONFIRMED` at once and can be entered until the slot starts: the 2 hours of the online bookings do not apply. A hiker with an email receives the confirmation.
- Hiker search for the staff (MH-07): `GET /api/hikers?search=` finds hikers by name, phone or email (at least 2 characters, at most 20 results).
- Change password (MH-07): `POST /api/auth/change-password`. An account created by the staff must change its password at the first login: the session user has the new field `mustChangePassword`.
- Password recovery by email (MH-07): `POST /api/auth/password-reset/request` sends a link valid for 24 hours and only once, `POST /api/auth/password-reset/confirm` sets the new password and closes every session.
- New environment variable: `WEB_URL` (default `http://localhost:3000`), the address of the web app in the links of the emails.
- Database (MH-07): hikers without an account may have no phone, new column `users.must_change_password`, new table `password_reset_tokens` and notification type `PASSWORD_RESET` (migrations `reserve_for_hiker` and `password_reset_notification`).
- Web app (MH-07): the staff page _New booking_ (`/staff/bookings/new`) with hiker search, quick entry and full profile, and the generated password shown once; the forced change of the password after the first login (`/change-password`); the pages to ask for a reset link (`/forgot-password`) and to set a new password (`/reset-password?token=`).
- Documentation of MH-07 in [docs/stories](docs/stories/MH-07-reserve-for-a-hiker.md).
- Change a booking (MH-06): `PATCH /api/bookings/:id` lets a hiker change the slot, the party size or the party requirements (the MH-05 list, replaced as a whole) of their own booking, up to 48 hours before the booked slot. The new slot must also start at least 48 hours later (course issue #43). Every change is treated as a new booking (course issues #38 and #48): the seats of the booking are released and the party is seated again with the MH-01 rules, even when it still fits at its tables or only the requirements change; if the seats are not enough, the change is refused and the booking stays as it was. The hiker receives an email with the new details.
- Database: new notification type `BOOKING_CHANGE` (migration `add_booking_change_notification`).
- Availability page at `/availability` (MH-04), open without an account and linked from the home page: date, time and party size, then "Available" with the slot, the table layout and the tables, or "Not available" with the reason.
- From an available result, "Book a table" opens the booking page with the date, the slot and the party size already chosen; a visitor goes through registration or sign in first (`?next=`, only paths of the app) and then lands on that booking page.
- Repeat a weekly schedule (MH-09): `POST /api/slots/repeat-weekly` (staff only) copies the slots and tables of the 7 days starting at `sourceStartDate` into each of the next `repeatWeeks` weeks (1 to 12). A target week that already has slots is replaced completely, unless one of its slots has pending or confirmed bookings: then the answer is `409` and nothing changes (course issue #45). An empty source week answers `422`.
- Web app (MH-09): a **Repeat weekly schedule** button on `/staff/slots` opens a dialog with the source week of the chosen day, the number of weeks (1 to 12) and the target period. Before confirming, it says how many slots already in the target weeks will be replaced; the page then shows how many slots were created and replaced.
- Documentation of MH-09 in [docs/stories](docs/stories/MH-09-repeat-a-weekly-schedule.md).
- Integration and end-to-end tests for repeating a weekly schedule (MH-09).
- Cancel a booking (MH-08): `POST /api/bookings/:id/cancel` (hiker only, no body) cancels a `PENDING` or `CONFIRMED` booking of the hiker, at any time, and answers the booking with status `CANCELLED`. Its seats are free for other guests at once, and the hiker can book the same slot again. Another hiker's booking answers `404`; a booking already cancelled or rejected answers `409`.
- New booking status `CANCELLED` (MH-08): migrations `booking_cancelled_status` and `one_booking_per_slot_ignores_cancelled`. A cancelled booking keeps its table assignments as history, but no longer holds seats.
- Documentation of MH-08 in [docs/stories](docs/stories/MH-08-cancel-a-booking.md).
- Integration and end-to-end tests for cancelling a booking (MH-08).
- "My bookings" page (MH-08): the Cancel button asks to confirm with a recap of the booking, then says that it has been cancelled; the booking moves to the "Cancelled" tab and its seats are free again.
- Project skeleton: NestJS API, React web app, shared package, Playwright end-to-end tests, Docker setup.
- Database schema for authentication.
- Authentication (MH-58): endpoints `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout` and `GET /api/auth/me`.
- Session based on a JWT access token and a refresh token, both stored in `httpOnly` cookies. The refresh token is rotated on every use, and if an already-used token is presented again, all of the user's sessions are revoked.
- New environment variables: `JWT_SECRET` (required), `JWT_EXPIRES_IN` (default `15m`) and `REFRESH_TOKEN_TTL_DAYS` (default `1`).
- API documentation with Swagger at `/api/docs`.
- Database schema for bookings (MH-01): slots, tables per slot, bookings and table assignments.
- Booking confirmation (MH-03): `POST /api/bookings` accepts optional party `requirements` (up to 500 characters, e.g. allergies) and the hiker receives a confirmation email after the booking is stored.
- Booking confirmed by its email (MH-03): a new booking is `PENDING` and becomes `CONFIRMED` once its confirmation email is sent. A failed email is retried up to 3 times, after 1, 5 and 25 seconds; if all attempts fail, the booking stays `PENDING`.
- Email service (MH-03): booking confirmation email, and a record of every email sent or failed, linked to its booking. By default emails go to Mailpit (http://localhost:8025); a real SMTP server is configured with the new environment variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`.
- Table booking (MH-01): endpoint `POST /api/bookings` for logged-in hikers, with a 2-hour booking limit and automatic table assignment, and one booking for each hiker and slot.
- Slot list (MH-01): endpoint `GET /api/slots` with the free seats and the availability of each future slot.
- Booking page at `/book`, sign-in and registration pages in the web app.
- New environment variable: `BOOKING_TIMEZONE` (default `Europe/Rome`).
- Documentation of MH-01 in [docs/stories](docs/stories/MH-01-book-a-table.md).
- Integration tests with PostgreSQL for bookings (`npm run test:int`) and PostgreSQL service container in CI.
- Home page and look of the sign-in and register pages (MH-00): hut presentation with essential information, shared form fields, sign-in/register tabs and a navigation bar that shows the signed-in user with a sign-out button.
- Time slots page for the staff at `/staff/slots` (MH-02), linked in the navigation bar for employees and wardens: the slots of a day with their tables and seats, a form to create a slot with its tables entered or copied from another slot, and the tables of a slot that has none.
- Slot capacity (MH-02): staff create time slots and define their tables and seats, or copy them from another slot (`POST /api/slots`, `PUT /api/slots/:id/tables`, `GET /api/slots/schedule`, `GET /api/slots/:id`).
- Role checks: `@Roles(...)` with `RolesGuard` limits an endpoint to some roles (hikers get 403).
- Documentation of MH-02 in [docs/stories](docs/stories/MH-02-define-slot-capacity.md).
- Documentation of MH-03 in [docs/stories](docs/stories/MH-03-receive-confirmation.md).
- Landing pages for Page Not Found (404, `NotFoundPage`) and Access Restricted (401/403, `UnauthorizedPage`) with custom responsive layouts matching the hut branding.
- Dedicated client routes `/unauthorized` and `/forbidden` in `apps/web/src/router.tsx` providing contextual guidance and actions depending on whether the visitor is unauthenticated, a hiker, or a staff member.
- Catch-all route `*` for missing or invalid URLs with quick return links to home and table booking.
- Unit tests with 100% test coverage for `NotFoundPage` and `UnauthorizedPage`.
- A `release-<n>` tag publishes the Docker image of the release on GitHub Container Registry, with the same tag.

### Changed

- Time slots of the same day can no longer overlap (MH-02, course issue #31): `POST /api/slots` answers `409` to a slot that overlaps another one, while contiguous slots (12:00–13:00 and 13:00–14:00) are accepted. Slots that already overlap in an existing database are kept.
- The seed creates six slots a day that do not overlap, for 14 days from today: 12:00–13:00, 13:00–14:00, 14:00–15:00, 18:00–19:00, 19:00–20:00 and 20:00–21:00, each with 6 tables and 24 seats. It deletes the slots and bookings already in the database, so run it by hand (`npm run prisma:seed -w @mountain-hut/api`) only on a development database.
- The seed moved from `apps/api/prisma/seed.ts` to `apps/api/src/seed.ts`, so that it is built into the Docker image; `npm run prisma:seed -w @mountain-hut/api` still runs it.
- The application no longer starts without `JWT_SECRET`.
- Accounts (`User`) are separated from the hiker profile (`Hiker`): registration now requires a full name and a phone number, with optional notes and emergency contact.
- Bookings (`Booking`) refer to the hiker (`hikerId`) instead of the account.
- All API messages are in English.
- `docker compose` passes `BOOKING_TIMEZONE` to the application.
- The `one_booking_per_slot` migration fails if a local database contains duplicate bookings for a hiker and slot: reset it with `docker compose down -v`.
- The `split_user_hiker` migration drops columns of `users` and `bookings`: with local data, start again with `docker compose down -v`.
- The register form explains the rules of the schema in each error message: a password with a letter and a digit, a phone number with 7 to 15 digits, and a full name with a letter.

### Fixed

- `POST /api/auth/refresh` and `POST /api/auth/logout` no longer answer 500 to a refresh cookie that is not a token.
- Registration answers 400 to text the database cannot store, instead of 500.
- Login rejects passwords over 72 bytes, which bcrypt would otherwise compare only in part.
- The API refuses to start with an invalid `REFRESH_TOKEN_TTL_DAYS`, instead of failing on every login.
- Registration now rejects passwords without a letter and a digit, phone numbers that are not 7-15 digits, and full names without a letter. Existing accounts can still log in.
- Swagger shows the request body of `POST /api/auth/register` and `POST /api/auth/login`, and marks `GET /api/auth/me` as protected by the session cookie.
- The Docker image applies the pending database migrations on startup, so the system also works on a new, empty database.
- Overlapping slots that use the same table number now share its seats, so the same seats cannot be booked twice.

### Removed

- The temporary user concept (`isTemporary`) is removed: a hiker without an account is a `Hiker` without a `User`.
