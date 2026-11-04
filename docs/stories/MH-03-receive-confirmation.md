# MH-03 — Receive confirmation

|                |                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| **Status**     | Complete (confirmation email, notification logging, confirmation status transition, retries backoff) |
| **Depends on** | MH-01 (book a table), Mailpit or an SMTP server, hiker profile (`Hiker`)                             |

## User story

**Business value:** 980

As a hiker, I want to receive confirmation containing the details of my booking, so that I know the reservation was successful.

Notification is sent via email to the hiker who made the reservation.

### Clarifications

The email contains:

- a booking reference,
- the date and time slot,
- the party size,
- possible party requirements (e.g. allergies),
- the name of the hiker that made the reservation.

## Requirements

| #   | Requirement                                                   | Status | Implemented in                                                          |
| --- | ------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| R1  | An email is sent to the hiker who made the reservation        | Done   | `BookingsService.create`, `NotificationService`                         |
| R2  | The email contains a booking reference                        | Done   | `bookingConfirmationEmail` (booking id)                                 |
| R3  | The email contains the date and the time slot                 | Done   | `bookingConfirmationEmail`                                              |
| R4  | The email contains the party size                             | Done   | `bookingConfirmationEmail`                                              |
| R5  | The email contains the party requirements, e.g. allergies     | Done   | `bookings.requirements`, optional free-text (up to 500 chars)           |
| R6  | The email contains the name of the hiker who made the booking | Done   | `bookingConfirmationEmail`                                              |
| R7  | The booking is confirmed when its confirmation email is sent  | Done   | `BookingsService.sendConfirmation`, `BookingsRepository.confirmBooking` |

### Decisions

- **The email confirms the booking.** A new booking starts with `PENDING` status (from [MH-01](MH-01-book-a-table.md)). When the SMTP server accepts the confirmation email, the booking status transitions to `CONFIRMED`. If the email delivery fails after all retries, the booking remains `PENDING`. See [Booking status](#booking-status).
- **Automatic retries for delivery failures.** A failed email attempt is retried up to 3 times with exponential backoff (delays of 1s, 5s, and 25s, defined in `CONFIRMATION_RETRY_DELAYS_MS`). If all 4 attempts (1 initial + 3 retries) fail, the booking stays `PENDING`.
- **The email never blocks or rolls back a booking.** It is sent asynchronously after the booking transaction has been committed. A slow SMTP server or delivery failure never delays or fails the HTTP `201 Created` response to the hiker.
- **Every attempt is audited** in the `notifications` table as `SENT` or `FAILED`, with the recipient, subject, timestamp, SMTP error message (if failed), and foreign keys to the user and booking.
- **Party requirements are one free-text field** of at most 500 characters. Text is trimmed, and NUL characters (`\u0000`) are rejected. Structured requirements with individual allergy flags are planned for MH-05.
- **Omission when empty.** The email displays the requirements line only when the hiker provided some; empty strings or whitespace-only inputs are stored as `null` and omitted from the email.
- **The booking reference is the database booking ID.**
- **Hikers without an email.** If a hiker profile has no email address (e.g. future walk-ins registered by staff without an email), the notification step is skipped (`SKIPPED`), no email is sent, and no notification error is recorded.
- **Mailpit by default.** In local development and Docker Compose, emails are captured by Mailpit (`localhost:1025`) and can be viewed in its web interface at <http://localhost:8025>. A real SMTP server is configured via environment variables.
- **Strict port validation.** `SMTP_PORT` must be a valid integer in the range 1–65535; invalid values throw an error at configuration loading.

## How it works

1. `POST /api/bookings` validates input (including optional `requirements`) and executes the booking transaction as described in [MH-01](MH-01-book-a-table.md).
2. The booking is inserted with status `PENDING`, and table seats are assigned.
3. The transaction commits and the HTTP handler immediately returns `201 Created` with the booking details.
4. Asynchronously, `BookingsService.sendConfirmation` reads the booking details along with the hiker's full name, email, and slot schedule.
5. `NotificationService` renders the email template (both plain text and HTML) and attempts delivery through `Mailer`.
6. Each attempt is logged in `notifications` (`SENT` or `FAILED`).
7. If the email fails with `FAILED`, it is retried after 1s, 5s, and 25s.
8. Once the email is accepted (`status === 'SENT'`), `BookingsRepository.confirmBooking` transitions the booking from `PENDING` to `CONFIRMED`.
9. If all attempts fail or the recipient has no email, the booking remains `PENDING`.

If the booking request itself is rejected (e.g. `409 Conflict` or `422 Unprocessable Entity`), no email attempt is triggered.

### Booking status

| Condition                                   | Status      |
| ------------------------------------------- | ----------- |
| Booking stored                              | `PENDING`   |
| Email accepted by SMTP server               | `CONFIRMED` |
| Email failed after all retries (4 attempts) | `PENDING`   |
| Hiker without email (skipped)               | `PENDING`   |

Both `PENDING` and `CONFIRMED` bookings occupy table seats, so the outcome of the email never alters table availability.

"Sent" means that the SMTP server (Mailpit or a real provider) accepted the message for delivery.

### The email

Subject: `Booking n. <id> confirmed - <date>`. The email provides both a plain-text and an HTML version with identical information:

```text
Hi Anna Rossi,

your booking at the shelter is confirmed.

Booking n.: 42
Name: Anna Rossi
Date: Saturday, 14 November 2026
Time: 12:30 - 13:30
People: 4 people
Requirements: One nut allergy

We await you!
Mountain Hut
```

- Dates and times are displayed in the hut's local time (`BOOKING_TIMEZONE`).
- `People` uses the singular format for a party of one (`1 person`).
- In the HTML version, user-provided inputs (`name` and `requirements`) are escaped to prevent XSS, and line breaks in requirements are preserved as `<br>`.
- If no requirements were entered, the `Requirements:` line is omitted.

## API

### `POST /api/bookings`

Extends the endpoint of [MH-01](MH-01-book-a-table.md#post-apibookings) with an optional `requirements` field:

| Field          | Type    | Rules                                                                  |
| -------------- | ------- | ---------------------------------------------------------------------- |
| `slotId`       | integer | Positive, at most 2147483647                                           |
| `partySize`    | integer | Positive; must fit in the free seats of the slot                       |
| `requirements` | string  | Optional; trimmed; at most 500 characters; no NUL character (`\u0000`) |

```bash
curl -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/bookings \
  -d '{"slotId":1,"partySize":3,"requirements":"One nut allergy"}'
```

Response `201 Created`:

```json
{
  "id": 42,
  "slotId": 1,
  "partySize": 3,
  "status": "PENDING",
  "tables": [{ "tableNumber": 2, "assignedSeats": 3 }]
}
```

The response is returned immediately as `PENDING`. Once the email is delivered in the background, the booking record in the database transitions to `CONFIRMED`.

### Errors

| Status | When                                                   | `message`                                            |
| ------ | ------------------------------------------------------ | ---------------------------------------------------- |
| `400`  | Body is invalid, `requirements` > 500 chars or has NUL | `Invalid data` (details in `issues`)                 |
| `401`  | No active user session                                 | `Not authenticated`                                  |
| `403`  | The authenticated user has no hiker profile            | `A hiker profile is required to book a table`        |
| `404`  | The specified slot does not exist                      | `Slot not found`                                     |
| `409`  | Insufficient free seats for party size                 | `Insufficient seats available for this slot`         |
| `409`  | The hiker already has an active booking for this slot  | `You already have a booking for this slot`           |
| `422`  | The slot starts in less than 2 hours                   | `Less than 2 hours remaining before the slot starts` |

## Web app

The booking flow on `/book` communicates the confirmation lifecycle:

1. **Confirmation modal (`BookingSentDialog`):** When the booking request completes, an accessible dialog modal is displayed:
   - Header: _"Booking request sent"_.
   - Badge: _"Awaiting confirmation"_.
   - Description: _"We have received your request. The booking is not confirmed yet: wait for the hut's confirmation email to be sure your table is reserved."_
2. **Requirements note:** In the current release, requirements are accepted through API clients; the web booking form will feature dedicated input for structured requirements and allergy tags with MH-05.

## Data model

| Table           | Change / Role                                                           |
| --------------- | ----------------------------------------------------------------------- |
| `bookings`      | Nullable column `requirements` (`TEXT`); status updated to `CONFIRMED`  |
| `notifications` | Audit log table: records every notification attempt and delivery status |

`notifications` table schema:

| Column       | Type          | Description                                                  |
| ------------ | ------------- | ------------------------------------------------------------ |
| `id`         | `SERIAL`      | Primary key                                                  |
| `type`       | `VARCHAR`     | `BOOKING_CONFIRMATION`                                       |
| `recipient`  | `VARCHAR`     | Recipient email address                                      |
| `subject`    | `VARCHAR`     | Subject line of the email                                    |
| `status`     | `VARCHAR`     | `SENT` or `FAILED`                                           |
| `error`      | `TEXT`        | SMTP error details when `status` is `FAILED`, otherwise null |
| `user_id`    | `INTEGER`     | Foreign key to `users(id)` (`ON DELETE SET NULL`)            |
| `booking_id` | `INTEGER`     | Foreign key to `bookings(id)` (`ON DELETE SET NULL`)         |
| `created_at` | `TIMESTAMPTZ` | Timestamp of the attempt                                     |

Migrations:

- `20261028104416_add_booking_tables`
- `20261030085156_split_user_hiker`
- `20261031120000_one_booking_per_slot`

## Configuration

| Variable    | Default                                     | Purpose                                         |
| ----------- | ------------------------------------------- | ----------------------------------------------- |
| `SMTP_HOST` | `localhost` (`mailpit` in Docker)           | SMTP server hostname                            |
| `SMTP_PORT` | `1025`                                      | SMTP port (1–65535); port 465 uses implicit TLS |
| `SMTP_USER` | _empty_                                     | SMTP username (credentials omitted if empty)    |
| `SMTP_PASS` | _empty_                                     | SMTP password                                   |
| `MAIL_FROM` | `Mountain Hut <no-reply@mountain-hut.test>` | Sender address (`From`) for outgoing emails     |

`docker-compose.yml` runs Mailpit as a service and configures these variables for the `app` container.

Emails can be inspected in development at <http://localhost:8025>.

## Code map

| Path                                                           | Content                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| `packages/shared/src/bookings.ts`                              | Schema with `requirements` field (max 500 chars)           |
| `apps/api/src/bookings/bookings.service.ts`                    | Asynchronous confirmation dispatch, retry backoff, confirm |
| `apps/api/src/bookings/bookings.repository.ts`                 | Reads booking email details, `confirmBooking` query        |
| `apps/api/src/notifications/notification.service.ts`           | Sends email and logs to `notifications` table              |
| `apps/api/src/notifications/templates/booking-confirmation.ts` | Email subject, plain-text and HTML templates               |
| `apps/api/src/notifications/templates/escape-html.ts`          | HTML escaping utility for safe rendering                   |
| `apps/api/src/notifications/mailer.ts`                         | `Mailer` interface and Nodemailer `SmtpMailer`             |
| `apps/api/src/notifications/mail.config.ts`                    | SMTP configuration and port range validation               |
| `apps/api/src/notifications/notifications.module.ts`           | NestJS notifications module                                |
| `apps/api/prisma/schema.prisma`                                | `Notification` model and `Booking.requirements`            |
| `apps/web/src/components/BookingSentDialog.tsx`                | Dialog explaining the email confirmation status            |

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

| Spec                                                                | Covers                                                                 |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/shared/src/bookings.spec.ts`                              | Request schema validation, length bounds, rejection of NUL bytes       |
| `apps/api/src/notifications/templates/booking-confirmation.spec.ts` | Email content, timezone formatting, party size pluralization, escaping |
| `apps/api/src/notifications/templates/escape-html.spec.ts`          | Escaping of user input in HTML templates                               |
| `apps/api/src/notifications/notification.service.spec.ts`           | Delivery flow, recording `SENT`/`FAILED`, missing recipient handling   |
| `apps/api/src/notifications/mail.config.spec.ts`                    | SMTP settings from env, port number and range (1–65535) validation     |
| `apps/api/src/notifications/mailer.spec.ts`                         | `SmtpMailer` sends emails via Nodemailer with correct options          |
| `apps/api/src/notifications/notifications.module.spec.ts`           | Module wiring and dependency injection                                 |
| `apps/api/src/bookings/bookings.service.spec.ts`                    | Confirmation trigger after commit, retry loop with backoff, confirm    |
| `apps/api/src/bookings/bookings.repository.spec.ts`                 | Booking confirmation data query and `confirmBooking` status update     |
| `apps/api/test/bookings.int-spec.ts`                                | Integration test for `confirmBooking` with real PostgreSQL             |
| `apps/web/src/components/BookingSentDialog.test.tsx`                | Dialog message advising the hiker to wait for confirmation email       |
| `e2e/tests/api/bookings.spec.ts`                                    | E2E test verifying Mailpit receives email and booking is `CONFIRMED`   |

### Try it manually

1. Start the stack: `docker compose up --build -d --wait`.
2. Book a table using the UI (<http://localhost:3000/book>) or via API:
   ```bash
   curl -b cookies.txt -H 'Content-Type: application/json' \
     http://localhost:3000/api/bookings \
     -d '{"slotId":1,"partySize":2,"requirements":"Gluten allergy"}'
   ```
3. Open Mailpit at <http://localhost:8025> to view the confirmation email with the booking details and allergen notes.
4. To test failure and retries, stop Mailpit (`docker compose stop mailpit`) and make a booking: the booking succeeds with `PENDING`, retries 3 times, records `FAILED` in `notifications`, and remains `PENDING`.

## Open points

- **Structured requirements (MH-05).** MH-05 will replace the free-text field with a structured list of requirements and allergy tags, including UI selection on the booking page.
