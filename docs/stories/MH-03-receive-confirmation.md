# MH-03 — Receive confirmation

|                |                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Email sent by the API. In progress: the booking becomes `CONFIRMED` once its email is sent. The booking page cannot send requirements yet |
| **Depends on** | MH-01 (book a table), Mailpit or an SMTP server, hiker profile (`Hiker`)                                                                  |

## User story

As a hiker, I want to receive confirmation containing the details of my booking, so that I know the reservation was successful.

The notification is an email, sent to the hiker who made the reservation.

## Requirements

| #   | Requirement                                                   | Status  | Implemented in                                  |
| --- | ------------------------------------------------------------- | ------- | ----------------------------------------------- |
| R1  | An email is sent to the hiker who made the reservation        | Done    | `BookingsService.create`, `NotificationService` |
| R2  | The email contains a booking reference                        | Done    | `bookingConfirmationEmail`                      |
| R3  | The email contains the date and the time slot                 | Done    | `bookingConfirmationEmail`                      |
| R4  | The email contains the party size                             | Done    | `bookingConfirmationEmail`                      |
| R5  | The email contains the party requirements, e.g. allergies     | Partial | `bookings.requirements`, one free-text field    |
| R6  | The email contains the name of the hiker who made the booking | Done    | `bookingConfirmationEmail`                      |

### Decisions

- **The email confirms the booking.** A new booking is `PENDING` (see [MH-01](MH-01-book-a-table.md)). In progress: when the SMTP server accepts the confirmation email, the booking becomes `CONFIRMED`; if the email fails, it stays `PENDING`. See [Booking status](#booking-status).
- **The email never undoes a booking.** It is sent after the booking transaction has been committed, and an SMTP error is recorded instead of being returned to the hiker. The booking is stored even if the email fails.
- **The API does not wait for the email.** `POST /api/bookings` answers as soon as the booking is stored; the email follows a moment later.
- **Every attempt is recorded** in the `notifications` table as `SENT` or `FAILED`, with the SMTP error and the booking it is about.
- **The party requirements are one free-text field** of at most 500 characters. MH-05 asks for a list of requirements, each with an allergies flag; that list is left to MH-05, which will replace this field.
- **No requirements, no row.** The email shows the requirements only when the hiker typed some; text made only of spaces counts as none.
- **The booking reference is the booking id.**
- **A hiker without an email receives nothing** and no row is recorded. Today every hiker who books has an account and therefore an email; the case exists for hikers registered by the staff (MH-07).
- **By default emails go to Mailpit**, a fake SMTP server that catches them. A real server is configured through environment variables.

## How it works

1. `POST /api/bookings` stores the booking as `PENDING` in one transaction, as described in [MH-01](MH-01-book-a-table.md).
2. After the commit, `BookingsService` starts sending the confirmation without waiting for it, and answers `201`.
3. It reads the booking again, with the hiker's full name and email and the slot's date and times.
4. `NotificationService` builds the email from the template and sends it through the `Mailer`.
5. It records the attempt in `notifications`: `SENT`, or `FAILED` with the reason.
6. _In progress:_ if the email was sent, the booking becomes `CONFIRMED`.

If the booking is refused (for example `409` or `422`), no email is sent.

None of these steps can make the booking fail: errors are logged by the API and, from step 4, recorded in `notifications`.

### Booking status

| Moment                                 | Today     | In progress |
| -------------------------------------- | --------- | ----------- |
| Booking stored                         | `PENDING` | `PENDING`   |
| Email accepted by the SMTP server      | `PENDING` | `CONFIRMED` |
| Email failed (`FAILED` in the table)   | `PENDING` | `PENDING`   |
| Hiker without an email (no email sent) | `PENDING` | `PENDING`   |

Both `PENDING` and `CONFIRMED` bookings occupy their seats, so the outcome of the email never frees or takes seats.

Today the email says "confirmed" while the booking is still `PENDING`. The booking page already tells the hiker to wait for the confirmation email, which matches the behaviour in progress.

"Sent" means that the SMTP server (Mailpit, or a real one) accepted the email. It does not mean that it reached the hiker's inbox.

### The email

Subject: `Booking n. <id> confirmed - <date>`. The email has a plain-text and an HTML version with the same content:

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

- Dates and times are shown exactly as stored for the slot, in the hut's local time.
- `People` uses the singular for a party of one.
- In the HTML version the name and the requirements are escaped, and line breaks in the requirements are kept.

## API

### `POST /api/bookings`

The endpoint of [MH-01](MH-01-book-a-table.md#post-apibookings) accepts one more optional field:

| Field          | Type   | Rules                                                                  |
| -------------- | ------ | ---------------------------------------------------------------------- |
| `requirements` | string | Optional; trimmed; at most 500 characters; no NUL character (`\u0000`) |

An empty string is stored as no requirements. A value that breaks these rules is rejected with `400`.

```bash
curl -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/bookings \
  -d '{"slotId":1,"partySize":3,"requirements":"One nut allergy"}'
```

The response is unchanged. A failed email never changes the response.

## Data model

| Table           | Change                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| `bookings`      | New nullable column `requirements`                                      |
| `notifications` | New table: one row for each email the system tried to send, sent or not |

`notifications` columns:

| Column       | Content                                                       |
| ------------ | ------------------------------------------------------------- |
| `type`       | `BOOKING_CONFIRMATION`                                        |
| `recipient`  | Email address the message was sent to                         |
| `subject`    | Subject of the email                                          |
| `status`     | `SENT` or `FAILED`                                            |
| `error`      | SMTP error message when `status` is `FAILED`, otherwise empty |
| `user_id`    | The hiker's account                                           |
| `booking_id` | The booking the email is about                                |
| `created_at` | When the attempt was made                                     |

`user_id` and `booking_id` are set to `NULL` when the account or the booking is deleted, so the history of sent emails is kept.

Migrations: `add_notifications`, `add_booking_requirements`, `add_notification_booking`.

## Configuration

| Variable    | Default                                     | Purpose                                       |
| ----------- | ------------------------------------------- | --------------------------------------------- |
| `SMTP_HOST` | `localhost`; `mailpit` in Docker            | SMTP server                                   |
| `SMTP_PORT` | `1025`                                      | SMTP port; `465` uses implicit TLS            |
| `SMTP_USER` | empty                                       | SMTP user; without it no credentials are sent |
| `SMTP_PASS` | empty                                       | SMTP password                                 |
| `MAIL_FROM` | `Mountain Hut <no-reply@mountain-hut.test>` | Sender of every email                         |

`docker-compose.yml` starts Mailpit and passes these variables to the `app` container. Leave `SMTP_HOST` and `SMTP_PORT` empty in `.env` to use Mailpit, both locally and in Docker.

Read the emails caught by Mailpit at <http://localhost:8025>.

## Code map

| Path                                                           | Content                                          |
| -------------------------------------------------------------- | ------------------------------------------------ |
| `packages/shared/src/bookings.ts`                              | `requirements` field of the request schema       |
| `apps/api/src/bookings/bookings.service.ts`                    | Sends the confirmation after the commit          |
| `apps/api/src/bookings/bookings.repository.ts`                 | Reads the data the email needs                   |
| `apps/api/src/notifications/notification.service.ts`           | Sends and records each email                     |
| `apps/api/src/notifications/templates/booking-confirmation.ts` | Subject, text and HTML of the confirmation       |
| `apps/api/src/notifications/templates/escape-html.ts`          | Escapes values typed by users                    |
| `apps/api/src/notifications/mailer.ts`                         | `Mailer` abstraction and its SMTP implementation |
| `apps/api/src/notifications/mail.config.ts`                    | SMTP settings read from the environment          |
| `apps/api/src/notifications/notifications.module.ts`           | Nest module imported by the bookings module      |
| `apps/api/prisma/schema.prisma`                                | `Notification` model, `Booking.requirements`     |

To send another kind of email (for example MH-14), add a template next to `booking-confirmation.ts`, a value to `NotificationType`, and a method to `NotificationService`. Call it only after the database transaction has been committed.

## Testing

Run the unit tests:

```bash
npm run test -w @mountain-hut/shared
npm run test -w @mountain-hut/api
```

Run the end-to-end tests with Docker running. Rebuild the stack first, so that it runs the current code:

```bash
docker compose up --build -d --wait
npm run test:e2e
```

| Spec                                                                | Covers                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/shared/src/bookings.spec.ts`                              | Validation of `requirements`                                     |
| `apps/api/src/notifications/templates/booking-confirmation.spec.ts` | Content of the email, time zone, escaping, optional requirements |
| `apps/api/src/notifications/notification.service.spec.ts`           | Sending, recording `SENT`/`FAILED`, SMTP errors, missing email   |
| `apps/api/src/notifications/mail.config.spec.ts`                    | SMTP settings from the environment                               |
| `apps/api/src/notifications/mailer.spec.ts`                         | `SmtpMailer` sends through Nodemailer with the configured sender |
| `apps/api/src/notifications/templates/escape-html.spec.ts`          | Escaping of the values typed by users                            |
| `apps/api/src/notifications/notifications.module.spec.ts`           | The module provides the SMTP mailer                              |
| `apps/api/src/bookings/bookings.service.spec.ts`                    | Email sent after the commit, never blocking or failing a booking |
| `apps/api/src/bookings/bookings.repository.spec.ts`                 | Data read for the email                                          |
| `e2e/tests/api/bookings.spec.ts`                                    | The real email, read from Mailpit through its API                |

The end-to-end test reads Mailpit at `http://localhost:8025`; override it with `E2E_MAILPIT_URL`. The end-to-end tests delete their bookings afterwards, so their rows in `notifications` keep `booking_id` empty.

### Try it manually

1. Start the stack with `docker compose up --build -d --wait`.
2. Book a table as described in [MH-01](MH-01-book-a-table.md#try-it-manually), or call `POST /api/bookings` with `requirements` as shown above.
3. Open <http://localhost:8025>: the confirmation is the newest email.

To see a failure, stop Mailpit with `docker compose stop mailpit` and book again: the booking succeeds, and the row in `notifications` has `status = FAILED` and the reason in `error`.

## Open points

- **Booking confirmed by the email (in progress).** Until it is done, the email says "confirmed" while the booking stays `PENDING`. Bookings whose email failed stay `PENDING`, and nothing sends their email again.
- **Requirements in the web app.** The booking page has no field for the requirements yet, so only API clients can send them.
- **Requirements as a list (MH-05).** MH-05 will replace the free-text field with a list of requirements, each with an allergies flag. The email will then show the list.
- **No retry.** A `FAILED` email is recorded but not sent again. A retry job would need the email body and an attempt counter in `notifications`.
- **SMTP port range.** `SMTP_PORT` accepts any integer; values outside 1–65535 should be rejected at startup (TODO in `mail.config.ts`).
