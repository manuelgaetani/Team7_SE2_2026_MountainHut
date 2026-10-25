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
docker compose up --build
```

Default settings come from `docker-compose.yml`; override them with a `.env` file (see `.env.example`).

## Local development

```bash
npm install
cp .env.example .env
docker compose up -d db
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

#### Regenerate client

```bash
npm run prisma:generate -w @mountain-hut/api
```

## Release notes

- [CHANGELOG.md](CHANGELOG.md): summary of the changes in each release.
- [docs/release-notes](docs/release-notes/): detailed notes per release, created from [TEMPLATE.md](docs/release-notes/TEMPLATE.md).

## License

TBD
