# Release 1

**Date:** 2026-11-06
**Tag:** `release-1`
**Commit:** the merge of `chore/release-1` on `master`

## Summary

First release of Mountain Hut. Hikers can register, book a table for a time slot and receive a confirmation email. The hut staff can define the time slots with their tables and seats.

## User stories

| Story | Title                 | Status                                     |
| ----- | --------------------- | ------------------------------------------ |
| MH-00 | Home page and sign-in | Partial: see Known issues                  |
| MH-58 | Authentication        | Done                                       |
| MH-01 | Book a table          | Done, with the known issues below          |
| MH-02 | Define slot capacity  | Done, with the known issues below          |
| MH-03 | Receive confirmation  | Done; requirements are one free-text field |

Details are in [docs/stories](../stories/) and the full list of changes in the [CHANGELOG](../../CHANGELOG.md).

## How to run it

```bash
git checkout release-1
cp .env.example .env
docker compose up --build -d --wait
```

- Web app and API: <http://localhost:3000>
- API documentation: <http://localhost:3000/api/docs>
- Emails caught by Mailpit: <http://localhost:8025>

The Docker stack starts with an empty database, with no slots and no staff account. To add them, install the dependencies and run the seed once the stack is up:

```bash
npm ci
npm run prisma:generate -w @mountain-hut/api
npm run prisma:seed -w @mountain-hut/api
```

Seeded staff account: `employee@mountainhut.com`, password `Password123!`. It is for demos only.

The image of this release is `ghcr.io/manuelgaetani/team7_se2_2026_mountainhut:release-1`. To use it instead of building, pull it and name it as `docker-compose.yml` expects:

```bash
docker pull ghcr.io/manuelgaetani/team7_se2_2026_mountainhut:release-1
docker tag ghcr.io/manuelgaetani/team7_se2_2026_mountainhut:release-1 mountain-hut:local
docker compose up --no-build -d --wait
```

## Upgrade notes

This is the first release: there is nothing to upgrade from. Databases created during development may need `docker compose down -v`, which deletes their data.

`JWT_SECRET` is required. Emails go to Mailpit unless `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` are set.

## Known issues

- **Split parties (MH-01).** A party that needs more than one table uses the fewest tables, but not always the smallest set of seats: with 5, 4 and 4 free seats, a party of 8 gets 5 + 3 instead of 4 + 4.
- **Failed emails (MH-03).** After 1 send and 3 retries, the booking stays `PENDING` and keeps its seats, and nothing sends the email again. Retries are lost if the API restarts. The hiker cannot book the same slot again.
- **Expired session on `/book`.** The page does not refresh an expired access token: booking fails and the form is replaced by a "session expired" message.
- **Very large seat counts (MH-02).** Tables whose seats add up to more than the maximum integer make `GET /api/slots` answer `500` for all hikers.
- **Slot dates (MH-02).** Slots in the past are accepted, and the year 0000 answers `500`.
- **Overlapping slots (MH-02).** They are accepted, waiting for the answer to course issue #31. Tables with the same number share their seats.
- **Staff data.** Employees and wardens have no name of their own: it exists only on a hiker profile, which needs a phone number. The seed creates no warden.
- **Home page.** It has no location, directions or points of interest, and it shows the API status.
- **Party requirements (MH-03, MH-05).** They are one free-text field, not a list with an allergies flag.

## Tests

Verified on `chore/release-1`, on top of `master` at `4f0d760`, from a clean copy and an empty database:

- `npm ci`, format, lint, typecheck, hygiene, dead code check and build pass.
- Unit tests: 126 in `shared`, 324 in `api`, 6 API end-to-end tests and 98 in `web`, all passed.
- Integration tests with PostgreSQL: 59 passed.
- Playwright against the Docker stack: 82 passed.
- The start commands above, the seed, the staff login, Swagger and Mailpit work.

The Playwright web test of the time slots page fails if the seed has been run, because `getByLabel('Day')` then finds two elements. Run Playwright on a database without the seed, as CI does.
