# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Detailed notes for each release are in [docs/release-notes](docs/release-notes/).

## [Unreleased]

## [release-1] - 2026-11-06

Details in [docs/release-notes/release-1.md](docs/release-notes/release-1.md).

### Added

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
- Party requirements (MH-05): `POST /api/bookings` accepts a list of requirements, each with an allergies flag and a description, stores them in the new `party_requirements` table and returns them. The confirmation email lists them and marks the ones with allergies.


### Changed

- The application no longer starts without `JWT_SECRET`.
- Accounts (`User`) are separated from the hiker profile (`Hiker`): registration now requires a full name and a phone number, with optional notes and emergency contact.
- Bookings (`Booking`) refer to the hiker (`hikerId`) instead of the account.
- All API messages are in English.
- `docker compose` passes `BOOKING_TIMEZONE` to the application.
- The `one_booking_per_slot` migration fails if a local database contains duplicate bookings for a hiker and slot: reset it with `docker compose down -v`.
- The `split_user_hiker` migration drops columns of `users` and `bookings`: with local data, start again with `docker compose down -v`.
- The register form explains the rules of the schema in each error message: a password with a letter and a digit, a phone number with 7 to 15 digits, and a full name with a letter.
- `requirements` in `POST /api/bookings` is now a list of `{ allergies, description }` instead of a free text. Texts already stored are converted to one requirement flagged as allergies.

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
