# Release 1

**Date:** 2026-11-23
**Tag:** `release-1`
**Commit:** the merge of `chore/release-1` on `master`
**Docker image:** `ghcr.io/manuelgaetani/team7_se2_2026_mountainhut:release-1`

## Summary

First public release of Mountain Hut, at the end of Sprint 2.

- **Anyone** can check whether a party fits in a slot, without an account, and register as a hiker.
- **Hikers** can:
  - book a table in a time slot, with the requirements and allergies of their party;
  - receive a confirmation email;
  - change a booking, and cancel it.
- **The hut staff** can:
  - define the time slots with their tables and seats;
  - copy the schedule of a week into the following weeks;
  - see the floor plan of a slot;
  - enter a reservation for a hiker, also one without an account.

The release runs from its Docker image alone, without the repository: the first start creates demo accounts and 14 days of slots.

## User stories

| Story | Title                      | Status                                                                                                 |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| MH-00 | Home page and sign-in      | Done: home page, registration and sign-in                                                              |
| MH-58 | Authentication             | Done: session in `httpOnly` cookies, refresh token rotation                                            |
| MH-01 | Book a table               | Done: automatic table assignment, 2-hour limit, one booking per hiker and slot                         |
| MH-02 | Define slot capacity       | Done: slots with their tables and seats; slots of the same day cannot overlap (course issue #31)       |
| MH-03 | Receive confirmation       | Done: confirmation email, booking `CONFIRMED` once it is sent                                          |
| MH-04 | Check availability         | Done: public API and `/availability` page                                                              |
| MH-05 | Provide party requirements | Done: list of requirements with an allergies flag, in the booking, the email and the web app           |
| MH-06 | Change a booking           | Done: slot, party size and requirements, up to 48 hours before; every change seats the party again     |
| MH-07 | Reserve for a hiker        | Done: staff reservations, temporary hikers, generated passwords, password change and recovery by email |
| MH-08 | Cancel a booking           | Done: at any time, seats free at once                                                                  |
| MH-09 | Repeat a weekly schedule   | Done: copy a week into the next 1–12 weeks, refused when a target week has reservations                |

Details are in [docs/stories](../stories/), and the full list of changes is in the [CHANGELOG](../../CHANGELOG.md).

## How to run it

### Without the repository (recommended)

You need only Docker with Docker Compose. Put these two files in one empty folder:

- `docker-compose.release.yml`, attached to the GitHub Release `release-1` (it is also in the repository);
- `.env`, from the team's secrets file (`Team7-secrets.zip`). The minimum is `JWT_SECRET=<a long random string>`.

Then run:

```bash
docker compose -f docker-compose.release.yml up -d --wait
```

- Web app and API: <http://localhost:3000>
- API documentation: <http://localhost:3000/api/docs>
- Emails caught by Mailpit, when no SMTP server is configured: <http://localhost:8025>

The first start applies the database migrations and creates the demo data: the accounts below, and 14 days of slots from the day of the first start. Later starts keep the data.

To delete all data and start again:

```bash
docker compose -f docker-compose.release.yml down -v
```

### From the repository

```bash
git checkout release-1
cp .env.example .env
docker compose up --build -d --wait
npm ci
npm run prisma:generate -w @mountain-hut/api
npm run prisma:seed -w @mountain-hut/api
```

This stack starts with an empty database, so it needs the seed. The seed deletes the slots and bookings already in the database.

### Demo accounts

All of them use the password `Password123!`. They are for demos only.

| Role     | Email                       | What to try                                                               |
| -------- | --------------------------- | ------------------------------------------------------------------------- |
| EMPLOYEE | `employee@mountainhut.com`  | Time slots, floor plan, repeat a weekly schedule, reservation for a hiker |
| EMPLOYEE | `employee2@mountainhut.com` | As above                                                                  |
| WARDEN   | `warden@mountainhut.com`    | As an employee                                                            |
| HIKER    | `hiker@mountainhut.com`     | Book with requirements, see "My bookings", change and cancel a booking    |

The demo accounts have made-up addresses, so they do not receive email. To try the emails (confirmation, change, password recovery), register a hiker with a real mailbox.

## Configuration

All settings are environment variables, read from the `.env` next to `docker-compose.release.yml`:

| Variable                                                        | Default                                     | Meaning                                                                  |
| --------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| `JWT_SECRET`                                                    | none: required                              | Secret that signs the session tokens                                     |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Mailpit                                     | SMTP server for real emails; empty, the emails go to Mailpit             |
| `WEB_URL`                                                       | `http://localhost:3000`                     | Address of the web app in the links of the emails                        |
| `BOOKING_TIMEZONE`                                              | `Europe/Rome`                               | Time zone of the hut                                                     |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`             | `mountainhut`                               | Database credentials                                                     |
| `SEED_DEMO_DATA`                                                | `true` in `docker-compose.release.yml` only | Creates the demo data on the first start, when the database has no users |

## Upgrade notes

This is the first public release. A database created during development may hold data that the migrations cannot convert: start again with `docker compose down -v`, which deletes it. The container applies the pending migrations at every start, so a new, empty database gets its tables.

## Known issues

- **Slot dates (MH-02).** Slots in the past are still accepted, since the story does not say otherwise.
- **Failed emails (MH-03).** After 1 send and 3 retries (1, 5 and 25 seconds) a booking stays `PENDING`. Retries that are waiting are lost if the API restarts.
- **Demo accounts and email.** The demo accounts cannot receive emails, as explained above.
- **Flaky end-to-end test.** The web test `slots.spec.ts` "employee logs in, sees "Time slots" in nav, and manages slots" fails when other tests create slots for the same day. It does not affect the application.

## Tests

<!-- Fill in with the results of the release checks before merging. -->

- `npm ci`, format, lint, typecheck, hygiene, dead code check (knip) and build:
- Unit tests:
- Integration tests with PostgreSQL:
- Playwright against the Docker stack:
- `docker-compose.release.yml` from an empty folder, without the repository: first start with demo data, login with every demo account, a booking with its email, restart with the data kept:
