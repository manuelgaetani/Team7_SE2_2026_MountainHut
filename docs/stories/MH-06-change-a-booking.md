# MH-06 — Change a booking

|                |                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------- |
| **Status**     | API complete; web app and integration tests pending                                             |
| **Depends on** | MH-01 (bookings domain, book a table), MH-03 (receive confirmation), MH-05 (party requirements) |

## User story

**Business value:** 960

As a hiker,  
I want to change the date, time, party size, or requirements of my booking,  
So that the reservation reflects my current plans.

### Notes

- Changes are admitted within 48 hours from the date booked.
- Changes to party size are subject to the automatic verification of availability.

### Clarifications

- When a hiker increases the party size and the party no longer fits at the tables already assigned, it is treated as a new booking: the current seats are released and the tables are assigned again with the MH-01 rules. If there are not enough seats, the change is refused and the booking stays as it was.
- When a change has been done, the change to the reservation is notified by email.

Team assumptions, not confirmed by the PO:

- _48-hour cutoff:_ "within 48 hours from the date booked" is read as **at least 48 hours before the booked slot starts**, the boundary included. The start is the slot's date and time in the hut time zone (`BOOKING_TIMEZONE`, default `Europe/Rome`).
- _Target slot cutoff:_ a new slot (new date or time) must start in 2 hours or more, like a new booking (MH-01).
- _Partial changes:_ a hiker may change one, two or all of `slotId` (date and time), `partySize` and `requirements`. An empty change is rejected.

## Requirements

| #   | Requirement                                                                                        | Status | Implemented in                                                                          |
| --- | -------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| R1  | Hiker role restriction: only authenticated hikers can modify their bookings (`HIKER` role, RBAC)   | Done   | `BookingsController.change` (`@Roles('HIKER')`)                                         |
| R2  | Ownership check: hikers can only modify reservations belonging to their own hiker profile          | Done   | `BookingsService.change`                                                                |
| R3  | Modifiable fields: supports modifying date/time (via target `slotId`), `partySize`, `requirements` | Done   | `changeBookingSchema`, `BookingsService.change`                                         |
| R4  | Input validation: non-empty update, positive IDs within DB limits, party size >= 1, max 500 chars  | Done   | `changeBookingSchema`                                                                   |
| R5  | 48-hour cutoff: changes requested less than 48 hours before the booked slot are rejected           | Done   | `isChangeAdmitted` (`booking-change-cutoff.ts`)                                         |
| R6  | Target slot cutoff: target slot must be at least 2 hours in the future (422)                       | Done   | `BookingsService.change`, `isBookableInTime`                                            |
| R7  | Automatic verification of availability: party size changes verify seat capacity against tables     | Done   | `canAccommodatePartyChange` (`change-seat-allocation.ts`)                               |
| R8  | Atomic table reallocation: table assignments are recalculated and updated in a single transaction  | Done   | `BookingsService.change`, `BookingsRepository`                                          |
| R9  | Not found handling: returns 404 if booking or target slot does not exist                           | Done   | `BookingsService.change`                                                                |
| R10 | The hiker is notified of the change by email                                                       | Done   | `BookingsService.change`, `NotificationService.sendBookingChange`, `bookingChangeEmail` |

### Decisions

- **HTTP method.** `PATCH /api/bookings/:id` for partial changes.
- **48-hour cutoff.** A change less than 48 hours before the booked slot answers `422`. It applies to every change, also when only the requirements change.
- **Tables after a change.** While the party still fits at the tables it already has (their free seats plus its own), it stays there, possibly on fewer of them. Otherwise the booking is seated again on all the tables of the slot with the MH-01 rules (`allocateSeats`). Moving to another slot always seats the party again. The booking's own seats count as free during the check, so it never competes with itself.
- **One booking per slot.** Moving to a slot where the hiker already has an active booking answers `409`, like `POST /api/bookings`.
- **Rejected bookings.** A `REJECTED` booking cannot be changed (`409`).
- **Status.** A change does not touch the status: a `CONFIRMED` booking stays confirmed.
- **Requirements.** `null` or an empty text removes them; text is trimmed.
- **Concurrency.** Everything runs in one transaction. The booking row is locked first (`SELECT ... FOR UPDATE`), so two changes of the same booking run one after the other; then the current and the target slot are locked in id order with the MH-01 slot lock, so a change and a new booking never oversell the same seats.
- **Email.** Sent after the commit and not awaited, like the MH-03 confirmation, so a slow SMTP server never delays the answer. One attempt only: the change is already stored, and a failure is recorded in `notifications` with type `BOOKING_CHANGE`.
- **Language.** All API messages are in English.

## How it works

1. `PATCH /api/bookings/:id` arrives with the session cookie. `AuthGuard` checks the session, `RolesGuard` the `HIKER` role, `ZodValidationPipe(changeBookingSchema)` the body.
2. In one transaction, `BookingsService.change`:
   1. finds the hiker profile of the user (`403` if missing);
   2. locks the booking (`404` if missing, `403` if it belongs to another hiker, `409` if `REJECTED`);
   3. locks the current slot and, when it changes, the target slot (`404` if the target does not exist);
   4. checks the 48-hour cutoff on the current slot (`422`);
   5. for a new slot: checks the 2-hour cutoff (`422`) and that the hiker has no other booking there (`409`);
   6. when the slot or the party size changes: reads the free seats of the target slot without this booking and chooses the tables with `canAccommodatePartyChange` (`409` if they are not enough);
   7. deletes the old table assignments, updates the booking, and stores the new assignments. The old assignments go first: `booking_tables` points to the booking through `(booking_id, slot_id)`, so they cannot follow it to a new slot.
3. After the commit, the "booking changed" email is sent to the hiker with the new details.

## API

### `PATCH /api/bookings/:id`

Protected endpoint: session cookie of a `HIKER`.

| Param / Body field | Type           | Rules                                                                  |
| ------------------ | -------------- | ---------------------------------------------------------------------- |
| `id` (path)        | integer        | ID of the booking to change                                            |
| `slotId`           | integer        | Optional, positive, at most `2147483647`: the new slot (date and time) |
| `partySize`        | integer        | Optional, positive: checked against the free seats                     |
| `requirements`     | string \| null | Optional, at most 500 characters, no NUL byte; `null` removes them     |

At least one of `slotId`, `partySize` and `requirements` must be present.

```bash
curl -X PATCH -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/bookings/10 \
  -d '{ "partySize": 4, "requirements": "2 vegans, 1 peanut allergy" }'
```

Response `200 OK`:

```json
{
  "id": 10,
  "slotId": 1,
  "partySize": 4,
  "status": "CONFIRMED",
  "requirements": "2 vegans, 1 peanut allergy",
  "tables": [{ "tableNumber": 1, "assignedSeats": 4 }]
}
```

### Errors

| Status | When                                                      | `message`                                                         |
| ------ | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `400`  | Body breaks the schema, or is empty                       | `Invalid data` (details in `issues`)                              |
| `400`  | `id` is not a number                                      | `Validation failed (numeric string is expected)`                  |
| `401`  | No valid session cookie                                   | `Not authenticated`                                               |
| `403`  | The user is not a `HIKER`                                 | `Operation not allowed for your role`                             |
| `403`  | No hiker profile, or the booking belongs to another hiker | `You can only change your own bookings`                           |
| `404`  | The booking does not exist                                | `Booking not found`                                               |
| `404`  | The new slot does not exist                               | `Target slot not found`                                           |
| `409`  | Not enough seats for the change                           | `Insufficient seats available for the updated booking`            |
| `409`  | The hiker already has a booking in the new slot           | `You already have a booking for this slot`                        |
| `409`  | The booking is `REJECTED`                                 | `A rejected booking cannot be changed`                            |
| `422`  | Less than 48 hours before the booked slot                 | `Changes are only admitted up to 48 hours before the booked date` |
| `422`  | The new slot starts in less than 2 hours                  | `Less than 2 hours remaining before the slot starts`              |

## Web app

Not done yet (frontend task of MH-06). `e2e/tests/web/booking-change.spec.ts` describes the expected page.

## Data model

No new table or column. The `notification_type` enum gets the value `BOOKING_CHANGE`, for the change email.

Migrations:

- `20261112120000_add_booking_change_notification`

## Code map

| Path                                                                        | Content                                                                                                  |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/bookings.ts`                                           | `changeBookingSchema`, `ChangeBookingInput`, `ChangedBookingResult`                                      |
| `apps/api/src/bookings/booking-change-cutoff.ts`                            | 48-hour rule: `isChangeAdmitted`                                                                         |
| `apps/api/src/bookings/change-seat-allocation.ts`                           | Tables after a change: `canAccommodatePartyChange`                                                       |
| `apps/api/src/bookings/bookings.controller.ts`                              | `PATCH /api/bookings/:id` (`change`)                                                                     |
| `apps/api/src/bookings/bookings.service.ts`                                 | `change`: checks, locks, new tables and change email                                                     |
| `apps/api/src/bookings/bookings.repository.ts`                              | `lockBooking`, `findBookingTables`, `deleteBookingTables`, `updateBooking`, free seats without a booking |
| `apps/api/src/notifications/notification.service.ts`                        | `sendBookingChange`                                                                                      |
| `apps/api/src/notifications/templates/booking-confirmation.ts`              | `bookingChangeEmail`: "Booking n. X changed" with the new details                                        |
| `apps/api/prisma/migrations/20261112120000_add_booking_change_notification` | `BOOKING_CHANGE` notification type                                                                       |
| `packages/shared/src/booking-change.spec.ts`                                | Black-box schema unit tests: BVA, equivalence partitioning                                               |
| `apps/api/src/bookings/booking-change-cutoff.spec.ts`                       | Black-box domain unit tests: BVA on 48h boundary                                                         |
| `apps/api/src/bookings/change-seat-allocation.spec.ts`                      | Black-box domain unit tests: availability & multi-table allocation                                       |
| `e2e/tests/api/booking-change.spec.ts`                                      | E2E black-box API tests for booking change REST endpoint                                                 |
| `e2e/tests/web/booking-change.spec.ts`                                      | E2E black-box Web UI tests for hiker booking modification workflow                                       |

## Testing

```bash
# Unit tests
npm run test -w @mountain-hut/shared -- src/booking-change.spec.ts
npm run test -w @mountain-hut/api -- src/bookings/booking-change-cutoff.spec.ts src/bookings/change-seat-allocation.spec.ts

# E2E tests, against the running Docker stack
docker compose up --build -d --wait
npm run e2e:api -w @mountain-hut/e2e -- tests/api/booking-change.spec.ts
npm run e2e:web -w @mountain-hut/e2e -- tests/web/booking-change.spec.ts
```

| Spec                                                   | Covers                                                                                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/booking-change.spec.ts`           | Black-box schema tests: BVA for slotId/partySize/requirements, equivalence partitions, empty check                                                                     |
| `apps/api/src/bookings/booking-change-cutoff.spec.ts`  | Black-box domain cutoff: BVA on 48h boundary (exact, +1ms, -1h, midnight), boundary comparisons                                                                        |
| `apps/api/src/bookings/change-seat-allocation.spec.ts` | Black-box availability: single-table fit, multi-table allocation, capacity rejection, immutability                                                                     |
| `apps/api/src/bookings/bookings.repository.spec.ts`    | Free seats of a slot without the booking being changed                                                                                                                 |
| `e2e/tests/api/booking-change.spec.ts`                 | Black-box API: date/time change, party size, requirements, 48h cutoff (422), target slot cutoff, availability conflict (409), RBAC, Mailpit email                      |
| `e2e/tests/web/booking-change.spec.ts`                 | Black-box Web: UI booking edit, slot picker, 48h cutoff warning, capacity conflict notice, login redirection (stubs with `test.skip` pending web frontend integration) |

### Test Coverage Roadmap & Pending Tests

- **TODO(MH-06-whitebox):**
  - White-box unit tests for `booking-change-cutoff.ts`: decision condition coverage, MC/DC branch coverage.
  - White-box unit tests for `change-seat-allocation.ts`: keeping the current tables, tie-breaker comparison heuristics and table grouping permutations.
  - White-box unit tests for `bookings.service.ts` (`change`): each error path, transaction order, change email.
  - White-box unit tests for `bookings.controller.ts` (`change`): role check and validation pipe bindings.
  - Unit tests for the new repository methods, `NotificationService.sendBookingChange` and `bookingChangeEmail`.
- **TODO(MH-06-graybox):**
  - Gray-box unit tests verifying Italian CET/CEST daylight saving transitions across the 48-hour boundary.
  - Gray-box unit tests verifying Prisma SQL row locking order (`SELECT ... FOR UPDATE OF s_other`) and foreign key cascade behavior.
  - Gray-box unit tests for HTTP response headers, CORS headers, and cookie serialization.
- **TODO(MH-06-integration):**
  - PostgreSQL integration tests (`test/booking-change.int-spec.ts`) verifying concurrent modification requests and row-level locking on real DB.
- **TODO(MH-06-e2e):**
  - Planned future scenarios documented in `e2e/tests/api/booking-change.spec.ts` (concurrent modification race conditions, cancelled/rejected status, seasonal closure rejection, audit trail).
  - Planned future scenarios documented in `e2e/tests/web/booking-change.spec.ts` (cancel/discard changes, keyboard accessibility, visual diff comparison, screen reader 48h deadline announcement).

### Try it manually

1. Start the stack with `docker compose up --build -d` and create slots as staff (`/staff/slots`).
2. Log in as a hiker (`POST /api/auth/login`, for example from Swagger at http://localhost:3000/api/docs).
3. Book a slot at least 3 days ahead with `POST /api/bookings`.
4. Send `PATCH /api/bookings/:id` with a new `partySize`: `200 OK` with the new tables. Ask for more seats than the slot has: `409`, and the booking is unchanged.
5. Send `PATCH /api/bookings/:id` with the `slotId` of another slot: the seats move to the new slot (check `freeSeats` in `GET /api/slots`).
6. Change a booking of a slot starting in less than 48 hours: `422`.
7. Open Mailpit at http://localhost:8025: after each change there is a "Booking n. X changed" email with the new details.

## Open points

- **48-hour cutoff:** to confirm with the PO that it is measured from the slot start (current reading) and not from 00:00 of the booked day.
- **Party requirements format:** MH-05 turns `requirements` into a structured list. When it is merged, `changeBookingSchema`, the change email and this page must follow the new format.
- **E2E email test:** `Notification: Dispatches updated confirmation email...` waits for the first email of the hiker and reads the booking confirmation, which arrives a few milliseconds before the change email. It should wait for the change email.
- **Branch content:** this branch also carries the MH-04 and MH-05 story docs and E2E tests, which fail until those stories are implemented.
