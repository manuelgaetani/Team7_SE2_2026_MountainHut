# Team7_SE2_2026_MountainHut

Mountain Hut — Software Engineering II project (Politecnico di Torino, A.Y. 2026/27).

Requirements: [SE2-Polito/AY26-27-Mountain-Hut](https://github.com/SE2-Polito/AY26-27-Mountain-Hut)

## Repository layout

```
apps/
  api/        NestJS REST API (also serves the built web app in production)
    prisma/   Prisma schema and migrations (PostgreSQL)
  web/        React + Vite single-page application
packages/
  shared/     Types and validation shared by api and web
e2e/          Playwright end-to-end tests
docs/
  release-notes/  Detailed notes for each release
  stories/        Documentation of each user story
```

## Prerequisites

- Node.js 24 and npm
- Docker with Docker Compose

## Run a release without the repository

Each release is published as a Docker image on GitHub Container Registry, e.g. `ghcr.io/manuelgaetani/team7_se2_2026_mountainhut:release-1`. To run it you need only Docker with Docker Compose: no repository, no Node.js and no seed command.

1. Put these two files in one empty folder:
   - [`docker-compose.release.yml`](docker-compose.release.yml), also attached to the GitHub Release;
   - `.env`, from the team's secrets file (`Team7-secrets.zip`). The minimum is `JWT_SECRET=<a long random string>`; the `SMTP_*` settings send real emails (see [Emails](#emails)).
2. Start the system:

   ```bash
   docker compose -f docker-compose.release.yml up -d --wait
   ```

3. Open the web app at http://localhost:3000 and sign in with one of the [demo accounts](#demo-accounts).

The first start applies the database migrations and creates the demo data: the demo accounts and 14 days of slots, from the day of the first start. Later starts keep the data. To delete all data and start again:

```bash
docker compose -f docker-compose.release.yml down -v
```

`docker-compose.release.yml` sets `SEED_DEMO_DATA=true`. The container then runs `node dist/seed.js --on-start`, which creates the demo data only when the database has no users. The development `docker-compose.yml` does not set it, so its database starts empty.

### Demo accounts

| Role       | Email                       | Password       | Full Name        |
| ---------- | --------------------------- | -------------- | ---------------- |
| `EMPLOYEE` | `employee@mountainhut.com`  | `Password123!` | Hut Employee     |
| `EMPLOYEE` | `employee2@mountainhut.com` | `Password123!` | Hut Employee Two |
| `WARDEN`   | `warden@mountainhut.com`    | `Password123!` | Hut Warden       |
| `HIKER`    | `hiker@mountainhut.com`     | `Password123!` | Demo Hiker       |

They are for demos only, and their addresses are made up, so they do not receive emails. To try the emails, register a hiker with a real mailbox.

## Run the whole system with Docker

```bash
cp .env.example .env
docker compose up --build
```

`JWT_SECRET` is required and has no default, so `docker compose` refuses to start without it. Other settings default to the values in `docker-compose.yml`; override them in `.env`.

## Emails

The system sends emails (e.g. the booking confirmation) through SMTP. By default they go to [Mailpit](https://mailpit.axllent.org/), a fake SMTP server started by `docker compose` that catches every email instead of delivering it: read them at http://localhost:8025.

To deliver real emails, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` in `.env`. Port 465 uses implicit TLS; the other ports use STARTTLS when the server offers it.

The `.env` of a release, in the team's secrets file, sets these variables, so a release sends real emails: the confirmation of a booking, the change of a booking and the password recovery link. `WEB_URL` (default `http://localhost:3000`) is the address of the web app in the links of the emails. With the `SMTP_*` variables empty, the emails of a release also go to Mailpit at http://localhost:8025.

## API documentation

The API is documented with Swagger (OpenAPI), available whenever the API is running:

- Interactive UI: http://localhost:3000/api/docs
- OpenAPI JSON: http://localhost:3000/api/docs-json

The session is kept in `httpOnly` cookies. To call protected endpoints, first call the login endpoint from the Swagger UI: the browser stores the cookies and sends them with every next request.

### Seeded development accounts

In development the database starts empty. The seed script creates the [demo accounts](#demo-accounts) and 14 days of slots, six a day, each with 6 tables and 24 seats:

```bash
npm run prisma:seed -w @mountain-hut/api
```

It deletes the slots and bookings already in the database, so use it only on a development database.

## Web application routes

The single-page web application runs at `http://localhost:5173` in development (or `http://localhost:3000` when served by the API container) and provides the following routes:

| Route                    | Description                                                                                      | Access               |
| ------------------------ | ------------------------------------------------------------------------------------------------ | -------------------- |
| `/`                      | Home page with the hut presentation and quick actions                                            | Public               |
| `/availability`          | Check whether a party fits in a slot, with the seat split (MH-04)                                | Public               |
| `/book`                  | Book a table: day, time slot, party size and party requirements (MH-01, MH-05)                   | Hikers               |
| `/bookings`              | "My bookings": change (MH-06) or cancel (MH-08) a booking, and the hiker's profile               | Hikers               |
| `/login`                 | Sign in with email and password (MH-00)                                                          | Public               |
| `/register`              | Registration of a hiker with profile details (MH-00)                                             | Public               |
| `/change-password`       | Change the password; required at the first login of an account created by the staff (MH-07)      | Signed-in users      |
| `/forgot-password`       | Ask for a password recovery link by email (MH-07)                                                | Public               |
| `/reset-password?token=` | Set a new password from the link in the email (MH-07)                                            | Public               |
| `/staff/slots`           | Time slots of a day, tables and seats, slot creation and "Repeat weekly schedule" (MH-02, MH-09) | `EMPLOYEE`, `WARDEN` |
| `/staff/slots/:id/floor` | Floor plan of a slot: tables, occupied seats and the groups seated there                         | `EMPLOYEE`, `WARDEN` |
| `/staff/bookings/new`    | Reservation for a hiker, also a new or temporary one (MH-07)                                     | `EMPLOYEE`, `WARDEN` |
| `/unauthorized`          | Landing page for access restrictions (401/403) with role-aware guidance and actions              | Public               |
| `/forbidden`             | Alias to `/unauthorized`                                                                         | Public               |
| `*`                      | 404 "Page not found" page for unknown routes, with navigation back to home                       | Public               |

## Local development

```bash
npm install
cp .env.example .env
docker compose up -d db mailpit
npm run prisma:generate -w @mountain-hut/api
npm run build -w @mountain-hut/shared
npm run prisma:seed -w @mountain-hut/api
npm run dev:api
npm run dev:web
```

### Database (Prisma)

#### Create and apply a migration in development

```bash
npm run prisma:migrate -w @mountain-hut/api
```

#### Apply existing migrations

```bash
npm run prisma:deploy -w @mountain-hut/api
```

In Docker this is not needed: the app container applies the pending migrations every time it starts.

#### Regenerate client

```bash
npm run prisma:generate -w @mountain-hut/api
```

### Integration tests (API + PostgreSQL)

They run the API code against a real database, a separate one named like `DATABASE_URL` plus `_test` (e.g. `mountainhut_test`). It is created and migrated automatically, and emptied before every test: the development database is never touched.

```bash
docker compose up -d db
npm run test:int
```

They are not part of `npm test`, which runs without a database.

## User stories

- [MH-01 — Book a table](docs/stories/MH-01-book-a-table.md)
- [MH-02 — Define slot capacity](docs/stories/MH-02-define-slot-capacity.md)
- [MH-03 — Receive confirmation](docs/stories/MH-03-receive-confirmation.md)
- [MH-04 — Check availability](docs/stories/MH-04-check-availability.md)
- [MH-05 — Provide party requirements](docs/stories/MH-05-provide-party-requirements.md)
- [MH-06 — Change a booking](docs/stories/MH-06-change-a-booking.md)
- [MH-07 — Reserve for a hiker](docs/stories/MH-07-reserve-for-a-hiker.md)
- [MH-08 — Cancel a booking](docs/stories/MH-08-cancel-a-booking.md)
- [MH-09 — Repeat a weekly schedule](docs/stories/MH-09-repeat-a-weekly-schedule.md)

## Release notes

- [CHANGELOG.md](CHANGELOG.md): summary of the changes in each release.
- [docs/release-notes](docs/release-notes/): detailed notes per release, created from [TEMPLATE.md](docs/release-notes/TEMPLATE.md).

## License

EUPL-1.2.
We released this project under the European Union Public Licence (EUPL) to guarantee long-term openness, legal security, and fair collaboration.
We specifically chose this license for three reasons:

- Many mountain huts are owned by local municipalities, regions, or alpine associations. As the official open-source license of the European Union, the EUPL provides a legally solid, multilingual framework that ensures maximum compliance and trust when partnering with public and institutional entities.
- Unlike permissive licenses, the EUPL includes a strong SaaS (Software as a Service) clause. This guarantees that if a large commercial booking platform takes our code, modifies it, and hosts it as a paid online service, they are legally obligated to share their improvements back with the community.
- While it fiercely protects the core software from becoming closed-source, the EUPL explicitly allows linking to external systems. This means our booking engine can seamlessly integrate with proprietary APIs—like local weather stations, payment gateways, or regional tourism databases—without legal friction.
