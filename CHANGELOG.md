# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Detailed notes for each release are in [docs/release-notes](docs/release-notes/).

## [Unreleased]

### Added

- Project skeleton: NestJS API, React web app, shared package, Playwright end-to-end tests, Docker setup.
- Database schema for authentication.
- Authentication (MH-58): endpoints `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout` and `GET /api/auth/me`.
- Session based on a JWT access token and a refresh token, both stored in `httpOnly` cookies. The refresh token is rotated on every use, and if an already-used token is presented again, all of the user's sessions are revoked.
- New environment variables: `JWT_SECRET` (required), `JWT_EXPIRES_IN` (default `15m`) and `REFRESH_TOKEN_TTL_DAYS` (default `1`).
- API documentation with Swagger at `/api/docs`.
- Database schema for bookings (MH-01): slots, tables per slot, bookings and table assignments.
- Email service (MH-03): booking confirmation email, and a record of every email sent or failed. By default emails go to Mailpit (http://localhost:8025); a real SMTP server is configured with the new environment variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`.
- Table booking (MH-01): endpoint `POST /api/bookings` for logged-in hikers, with a 2-hour booking limit and automatic table assignment, and one booking for each hiker and slot.
- Slot list (MH-01): endpoint `GET /api/slots` with the free seats and the availability of each future slot.
- Booking page at `/book`, sign-in and registration pages in the web app.
- New environment variable: `BOOKING_TIMEZONE` (default `Europe/Rome`).
- Documentation of MH-01 in [docs/stories](docs/stories/MH-01-book-a-table.md).

### Changed

- The application no longer starts without `JWT_SECRET`.
- Separati gli account (`User`) dal profilo escursionista (`Hiker`): la registrazione richiede ora nome completo e telefono, con note e contatto di emergenza facoltativi.
- Le prenotazioni (`Booking`) fanno riferimento all'escursionista (`hikerId`) invece che all'account.
- All API messages are in English.
- `docker compose` passes `BOOKING_TIMEZONE` to the application.
- The `one_booking_per_slot` migration fails if a local database contains duplicate bookings for a hiker and slot: reset it with `docker compose down -v`.
- La migration `split_user_hiker` elimina colonne di `users` e `bookings`: chi ha dati locali deve ripartire con `docker compose down -v`.

### Fixed

- `POST /api/auth/refresh` and `POST /api/auth/logout` no longer answer 500 to a refresh cookie that is not a token.
- Registration answers 400 to text the database cannot store, instead of 500.
- Login rejects passwords over 72 bytes, which bcrypt would otherwise compare only in part.
- The API refuses to start with an invalid `REFRESH_TOKEN_TTL_DAYS`, instead of failing on every login.
- Registration now rejects passwords without a letter and a digit, phone numbers that are not 7-15 digits, and full names without a letter. Existing accounts can still log in.
- Swagger shows the request body of `POST /api/auth/register` and `POST /api/auth/login`, and marks `GET /api/auth/me` as protected by the session cookie.
- The Docker image applies the pending database migrations on startup, so the system also works on a new, empty database.

### Removed

- Rimosso il concetto di utente temporaneo (`isTemporary`): un escursionista senza account è un `Hiker` senza `User`.
