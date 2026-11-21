# MH-08 — Cancel a booking

|                |                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| **Status**     | API complete; web page pending (MOU-125)                                                             |
| **Depends on** | MH-58 (authentication), MH-01 (book a table, seat allocation), MH-03 (confirmation email and status) |

## User story

**Business value:** 950

As a hiker,  
I want to cancel a table booking,  
so that the hut can make the places available to other guests.

### Clarifications

- There are no time constraints, hikers can cancel a reservation at any time.

Team assumptions:

- _Own bookings only:_ a hiker cancels only their own bookings. The booking of another hiker answers like a missing one (`404`), so its id is not revealed.
- _Which bookings:_ a `PENDING` or `CONFIRMED` booking can be cancelled. A `CANCELLED` booking cannot be cancelled again, and a `REJECTED` one has never held seats.
- _Hiker cancellation only:_ the staff do not use this endpoint. The warden cancelling a reservation is MH-15.

## Requirements

| #   | Requirement                                                                        | Status  | Implemented in                                                                    |
| --- | ---------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| R1  | Only a logged-in hiker with a hiker profile cancels                                | Done    | `BookingsController.cancel` (`@Roles('HIKER')`), `BookingsService.cancel`         |
| R2  | A hiker cancels only their own bookings                                            | Done    | `BookingsService.cancel` (owner check, `404`)                                     |
| R3  | Cancellation is allowed at any time, also after the slot has started               | Done    | `decideCancellation` (no time check)                                              |
| R4  | Only a `PENDING` or `CONFIRMED` booking can be cancelled                           | Done    | `decideCancellation` (`409` for `CANCELLED` and `REJECTED`)                       |
| R5  | The seats of the cancelled booking are free for other guests as soon as it commits | Done    | Seat queries count only `CONFIRMED` and `PENDING` bookings (`bookedSeatsOnTable`) |
| R6  | The hiker can book the same slot again after cancelling                            | Done    | `hasActiveBooking`, index `bookings_hiker_id_slot_id_active_key`                  |
| R7  | Two cancellations of the same booking at the same time: only one succeeds          | Done    | `PrismaBookingsRepository.lockBooking` (`FOR UPDATE`) inside one unit of work     |
| R8  | Web app: the hiker sees their bookings and cancels one                             | Pending | MOU-125                                                                           |

### Decisions

- **Endpoint.** `POST /api/bookings/:id/cancel`, without a body. The booking is not deleted: it becomes `CANCELLED`, so the hut keeps its history. `POST` on an action, not `DELETE`, because nothing is removed.
- **No time limit.** The Clarifications allow cancelling at any time, so there is no cutoff: a booking for a slot that starts in one hour, or has already started, can still be cancelled.
- **Seat release.** The `booking_tables` rows of the booking stay as history. The free seats of a slot are computed only from `CONFIRMED` and `PENDING` bookings, so a `CANCELLED` booking stops holding seats as soon as its status changes. A table shared with another booking keeps the seats of the other booking, also in an overlapping slot that shares the table number (MH-01 rule).
- **Booking again.** A cancelled booking does not count as active, like a rejected one: the partial unique index on `(hiker_id, slot_id)` now ignores `REJECTED` and `CANCELLED`, so the hiker can book the same slot again.
- **Someone else's booking.** It answers `404 Booking not found`, the same as a missing booking, so a hiker cannot find out which ids exist. The booking stays as it was.
- **Concurrency.** One transaction: the booking row is locked (`SELECT ... FOR UPDATE`), then the owner and the status are checked and the status becomes `CANCELLED`. A second cancellation of the same booking waits for the first one and then answers `409`. Cancellations of different bookings do not wait for each other.
- **Response.** The cancelled booking: `id`, `slotId`, `partySize` and `status: "CANCELLED"`.
- **Email.** No email is sent for a cancellation.
- **Language.** All API messages are in English.

## How it works

1. `POST /api/bookings/:id/cancel` arrives with the session cookie. `AuthGuard` checks the session, `RolesGuard` the `HIKER` role, `ParseIntPipe` the id.
2. In one transaction, `BookingsService.cancel`:
   1. finds the hiker profile of the user (`403` if there is none);
   2. locks the booking row; an id that does not exist, is out of the `INTEGER` range or belongs to another hiker answers `404`;
   3. decides with `decideCancellation`: `409` if the booking is already `CANCELLED` or is `REJECTED`;
   4. sets the status to `CANCELLED`.
3. After the commit, the seats are free: `GET /api/slots` shows them again and `POST /api/bookings` can use them.

## API

### `POST /api/bookings/:id/cancel`

Hiker only (`HIKER`). No body.

| Param       | Type    | Rules                       |
| ----------- | ------- | --------------------------- |
| `id` (path) | integer | ID of the booking to cancel |

```bash
curl -X POST -b cookies.txt http://localhost:3000/api/bookings/10/cancel
```

Response `200 OK`:

```json
{
  "id": 10,
  "slotId": 1,
  "partySize": 4,
  "status": "CANCELLED"
}
```

### Errors

| Status | When                                                    | `message`                                         |
| ------ | ------------------------------------------------------- | ------------------------------------------------- |
| `400`  | The id is not a number                                  | `Validation failed (numeric string is expected)`  |
| `401`  | No valid session                                        | `Not authenticated`                               |
| `403`  | The user is not a hiker (employee, warden)              | `Operation not allowed for your role`             |
| `403`  | The user has no hiker profile                           | `A hiker profile is required to cancel a booking` |
| `404`  | The booking does not exist, or belongs to another hiker | `Booking not found`                               |
| `409`  | The booking is already cancelled                        | `This booking is already cancelled`               |
| `409`  | The booking was rejected                                | `A rejected booking cannot be cancelled`          |

## Data model

| Table / type     | Change                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `booking_status` | New value `CANCELLED`                                                                                         |
| `bookings`       | Index `bookings_hiker_id_slot_id_active_key` (one active booking per hiker and slot) also ignores `CANCELLED` |

Prisma cannot express a partial index in `schema.prisma`, so the index exists only in the migrations.

Migrations:

- `20261113185151_booking_cancelled_status`
- `20261113185256_one_booking_per_slot_ignores_cancelled`

## Code map

| Path                                                                 | Content                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `docs/stories/MH-08-cancel-a-booking.md`                             | This document                                                           |
| `packages/shared/src/bookings.ts`                                    | `CancelledBooking`, the response                                        |
| `apps/api/src/bookings/presentation/bookings.controller.ts`          | `POST /api/bookings/:id/cancel`, hiker only                             |
| `apps/api/src/bookings/application/bookings.service.ts`              | `BookingsService.cancel`: the transaction of a cancellation             |
| `apps/api/src/bookings/application/bookings.repository.port.ts`      | `lockBooking`, `cancelBooking`, `BookingToCancel`                       |
| `apps/api/src/bookings/infrastructure/prisma-bookings.repository.ts` | Row lock of the booking, new status; active bookings ignore `CANCELLED` |
| `apps/api/src/bookings/domain/booking-cancellation-policy.ts`        | `decideCancellation`: only `PENDING` and `CONFIRMED`, at any time       |
| `apps/api/src/bookings/domain/cancel-seat-release.ts`                | `releaseCancelledSeats`: pure helper, used only by its tests            |
| `apps/api/prisma/schema.prisma`                                      | `CANCELLED` in `BookingStatus`                                          |

## Testing

Run unit tests:

```bash
npm run test -w @mountain-hut/shared
npm run test -w @mountain-hut/api
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

| Spec                                                                      | Covers                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/booking-cancel.int-spec.ts`                                | Real PostgreSQL. Confirmed and pending bookings cancelled, table assignments kept as history, started slot (no cutoff), `409` twice and for a rejected booking, `404`/`403`, seats of every table freed, shared table and overlapping slot, freed seats booked again, the index, row lock, two concurrent cancellations, rollback |
| `e2e/tests/api/booking-cancel.spec.ts`                                    | Running stack. Cancel and free seats, freed seats to another hiker, the same slot booked again, slots starting in about 3 hours and 1 hour, `409` twice and rejected, another hiker's booking `404` and still active, missing and out-of-range id `404`, `400`, `401`, employee and no profile `403`                              |
| `apps/api/src/bookings/application/bookings.service.spec.ts`              | Black box and white box of `cancel`: `PENDING`/`CONFIRMED` cancelled, inside one unit of work, lock before the update, `403`, `404` missing and not owned, `409`, failed write rethrown                                                                                                                                           |
| `apps/api/src/bookings/presentation/bookings.controller.spec.ts`          | Black box of `POST /bookings/:id/cancel`: hiker only, `200` with the cancelled booking, the id as a number, `400` for an id that is not a number, `403`/`404`/`409` from the service                                                                                                                                              |
| `apps/api/src/bookings/infrastructure/prisma-bookings.repository.spec.ts` | White box: `lockBooking` and `cancelBooking`, ids out of range not queried, active bookings ignore `CANCELLED`                                                                                                                                                                                                                    |
| `apps/api/src/bookings/domain/booking-cancellation-policy.spec.ts`        | Black box of `decideCancellation`: the four statuses and their precedence                                                                                                                                                                                                                                                         |
| `apps/api/src/bookings/domain/cancel-seat-release.spec.ts`                | Black box of `releaseCancelledSeats`: one table, split party, untouched tables, limits, purity, unknown table and negative seats                                                                                                                                                                                                  |

### Try it manually

1. Start the stack with `docker compose up --build -d`.
2. Log in as a hiker and keep the cookies: `curl -c cookies.txt -H 'Content-Type: application/json' http://localhost:3000/api/auth/login -d '{"email":"<hiker email>","password":"<password>"}'`.
3. Find a slot with `curl -b cookies.txt http://localhost:3000/api/slots` and book it with `POST /api/bookings`. Note the `id` of the booking and the `freeSeats` of the slot.
4. Cancel it: `curl -X POST -b cookies.txt http://localhost:3000/api/bookings/<id>/cancel`. The answer is `200` with `status: "CANCELLED"`.
5. `GET /api/slots` again: `freeSeats` is back to the value before the booking.
6. Cancel it again: `409 This booking is already cancelled`.
7. Book the same slot again with `POST /api/bookings`: it is accepted.

## Open points

- **Web app.** There is no cancel button yet (MOU-125). The hiker needs a list of their bookings: `GET /api/bookings/me` of MH-06 is not on this branch yet. The web E2E test of the cancellation waits for this page.
- **Confirmation retries.** If the confirmation email of a new booking failed and is retried (MH-03: after 1, 5 and 25 seconds), a cancellation during the retries does not stop them: the hiker may still receive the confirmation of a cancelled booking. The booking stays `CANCELLED`, because only a `PENDING` booking becomes `CONFIRMED`.
- **Leftovers of the first design.** `booking-cancellation-cutoff.ts` (a 24-hour cutoff stub that throws), `cancelBookingSchema` in `packages/shared/src/bookings.ts` (with a `reason`) and their specs, which are skipped, belong to the first design. They are not used, because the Clarifications allow cancelling at any time.
