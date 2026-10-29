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

### Changed

- The application no longer starts without `JWT_SECRET`.
<<<<<<< HEAD
=======

### Fixed

- Swagger shows the request body of `POST /api/auth/register` and `POST /api/auth/login`, and marks `GET /api/auth/me` as protected by the session cookie.
>>>>>>> master
