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
```

## Prerequisites

- Node.js 24 and npm
- Docker with Docker Compose

## Run the whole system with Docker

```bash
cp .env.example .env
docker compose up --build
```

`JWT_SECRET` is required and has no default, so `docker compose` refuses to start without it. Other settings default to the values in `docker-compose.yml`; override them in `.env`.

## Emails

The system sends emails (e.g. the booking confirmation) through SMTP. By default they go to [Mailpit](https://mailpit.axllent.org/), a fake SMTP server started by `docker compose` that catches every email instead of delivering it: read them at http://localhost:8025.

To deliver real emails, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` in `.env`. Port 465 uses implicit TLS; the other ports use STARTTLS when the server offers it.

## API documentation

The API is documented with Swagger (OpenAPI), available whenever the API is running:

- Interactive UI: http://localhost:3000/api/docs
- OpenAPI JSON: http://localhost:3000/api/docs-json

The session is kept in `httpOnly` cookies. To call protected endpoints, first call the login endpoint from the Swagger UI: the browser stores the cookies and sends them with every next request.

## Local development

```bash
npm install
cp .env.example .env
docker compose up -d db mailpit
npm run prisma:generate -w @mountain-hut/api
npm run build -w @mountain-hut/shared
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
