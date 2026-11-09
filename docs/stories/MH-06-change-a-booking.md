# MH-06 — Change a booking

|                |                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------- |
| **Status**     | Unit test suite defined (black-box with stubs); implementation pending                          |
| **Depends on** | MH-01 (bookings domain, book a table), MH-03 (receive confirmation), MH-05 (party requirements) |

## User story

**Business value:** 960

As a hiker,  
I want to change the date, time, party size, or requirements of my booking,  
So that the reservation reflects my current plans.

### Notes & Clarifications

- **48-Hour Cutoff:** Changes are admitted within 48 hours from the date booked (i.e. requested at least 48 hours prior to the booked slot start time).
- **Automatic Availability Verification:** Changes to party size are subject to the automatic verification of availability against the hut's table capacity.
- **Clarifications:** No approved clarifications yet.
  - _Timezone calculation:_ The 48-hour cutoff is evaluated against the slot's absolute start instant computed in the hut local timezone (`Europe/Rome`).
  - _Target slot cutoff:_ If changing slot (date/time), the target slot must also respect the standard booking cutoff (at least 2 hours prior to start).
  - _Partial modifications:_ A hiker may update one, two, or all modifiable fields (`slotId` for date/time, `partySize`, `requirements`). Passing an empty modification payload is rejected.

## Requirements

| #   | Requirement                                                                                        | Status  | Implemented in                                                      |
| --- | -------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------- |
| R1  | Hiker role restriction: only authenticated hikers can modify their bookings (`HIKER` role, RBAC)   | Pending | `PATCH /api/bookings/:id`, `BookingsController.change`              |
| R2  | Ownership check: hikers can only modify reservations belonging to their own hiker profile          | Pending | `BookingsService.change`                                            |
| R3  | Modifiable fields: supports modifying date/time (via target `slotId`), `partySize`, `requirements` | Pending | `changeBookingSchema`, `booking-change.spec.ts`                     |
| R4  | Input validation: non-empty update, positive IDs within DB limits, party size >= 1, max 500 chars  | Pending | `changeBookingSchema`, `packages/shared/src/booking-change.spec.ts` |
| R5  | 48-hour cutoff: changes requested less than 48 hours before the booked slot are rejected           | Pending | `booking-change-cutoff.ts`, `booking-change-cutoff.spec.ts`         |
| R6  | Target slot cutoff: target slot must be at least 2 hours in the future (422)                       | Pending | `BookingsService.change`, `isBookableInTime`                        |
| R7  | Automatic verification of availability: party size changes verify seat capacity against tables     | Pending | `change-seat-allocation.ts`, `change-seat-allocation.spec.ts`       |
| R8  | Atomic table reallocation: table assignments are recalculated and updated in a single transaction  | Pending | `BookingsService.change`, `BookingsRepository`                      |
| R9  | Not found handling: returns 404 if booking or target slot does not exist                           | Pending | `BookingsService.change`, `NotFoundException`                       |

### Decisions

- **HTTP Method:** `PATCH /api/bookings/:id` is adopted for partial booking modifications.
- **48-Hour Cutoff Enforcement:** Changes must be submitted at least 48 hours before the reserved time slot. Requests within 48 hours return `422 Unprocessable Entity` to safeguard hut staffing and kitchen prep schedules.
- **Automatic Concurrency & Availability:** Table reallocations are evaluated via pure domain heuristics and serialized with row locks (`SELECT ... FOR UPDATE`).
- **Language:** All API error messages and UI feedback are in English.

## How it works

1. **Request Reception:** `PATCH /api/bookings/:id` receives the update payload with session cookie.
2. **Authentication & RBAC:** `AuthGuard` verifies session cookie; `RolesGuard` verifies the caller is a `HIKER`.
3. **Payload Validation:** `ZodValidationPipe(changeBookingSchema)` validates input bounds and ensures at least one field is provided.
4. **Transaction & Verification:**
   - Hiker profile existence and reservation ownership are verified.
   - Current slot is locked; if less than 48 hours remain before the slot starts, the request is rejected with `422 Unprocessable Entity`.
5. **Availability & Allocation:**
   - If `slotId` or `partySize` changed, target slot is checked for seat availability.
   - If seats are insufficient, the change is rejected with `409 Conflict`.
   - If valid, seat allocation computes optimal table assignments.
6. **Persistence & Notification:**
   - Table assignments and booking records are updated atomically in PostgreSQL.
   - Transaction commits and an updated confirmation email is dispatched asynchronously.

## API

### `PATCH /api/bookings/:id`

Protected endpoint, requires session cookie of an authenticated `HIKER`.

| Param / Body Field | Type    | Rules                                                           |
| ------------------ | ------- | --------------------------------------------------------------- |
| `id` (path)        | integer | Positive integer, ID of the booking to modify                   |
| `slotId` (body)    | integer | Optional positive integer, target future time slot              |
| `partySize` (body) | integer | Optional positive integer, subject to availability verification |
| `requirements`     | string  | Optional string, max 500 characters, no NUL; `null` to clear    |

_Note: At least one of `slotId`, `partySize`, or `requirements` must be provided._

#### Example Request: Change party size and requirements

```bash
curl -X PATCH -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/bookings/10 \
  -d '{
    "partySize": 4,
    "requirements": "2 vegans, 1 peanut allergy"
  }'
```

Response `200 OK`:

```json
{
  "id": 10,
  "slotId": 1,
  "partySize": 4,
  "status": "CONFIRMED",
  "tables": [{ "tableNumber": 1, "assignedSeats": 4 }]
}
```

### Errors

| Status | When                                                               | `message`                                                         |
| ------ | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `400`  | Payload violates schema (empty body, invalid bounds, string types) | `At least one field (slotId, partySize, requirements) must...`    |
| `401`  | Missing or expired session cookie                                  | `Unauthorized`                                                    |
| `403`  | User is not a `HIKER`, lacks profile, or does not own booking      | `You can only change your own bookings`                           |
| `404`  | Booking or target slot does not exist                              | `Booking not found` / `Target slot not found`                     |
| `409`  | Insufficient seats available for the updated party size            | `Insufficient seats available for the updated booking`            |
| `422`  | Change requested less than 48 hours before the booked date         | `Changes are only admitted up to 48 hours before the booked date` |

## Code map

| Path                                                   | Content                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `docs/stories/MH-06-change-a-booking.md`               | Living User Story documentation                                           |
| `packages/shared/src/bookings.ts`                      | Stub `changeBookingSchema` and TypeScript type `ChangeBookingInput`       |
| `packages/shared/src/booking-change.spec.ts`           | Black-box schema unit tests: BVA, equivalence partitioning                |
| `apps/api/src/bookings/booking-change-cutoff.ts`       | Domain stub: 48h cutoff rule (`isChangeAdmitted`)                         |
| `apps/api/src/bookings/booking-change-cutoff.spec.ts`  | Black-box domain unit tests: BVA on 48h boundary                          |
| `apps/api/src/bookings/change-seat-allocation.ts`      | Domain stub: party size change availability (`canAccommodatePartyChange`) |
| `apps/api/src/bookings/change-seat-allocation.spec.ts` | Black-box domain unit tests: availability & multi-table allocation        |

## Testing

Run unit tests:

```bash
# Shared package schema tests
npm run test -w @mountain-hut/shared -- src/booking-change.spec.ts

# API domain cutoff and seat allocation tests
npm run test -w @mountain-hut/api -- apps/api/src/bookings/booking-change-cutoff.spec.ts
npm run test -w @mountain-hut/api -- apps/api/src/bookings/change-seat-allocation.spec.ts
```

| Spec                                                   | Covers                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `packages/shared/src/booking-change.spec.ts`           | Black-box schema tests: BVA for slotId/partySize/requirements, equivalence partitions, empty check |
| `apps/api/src/bookings/booking-change-cutoff.spec.ts`  | Black-box domain cutoff: BVA on 48h boundary (exact, +1ms, -1h, midnight), boundary comparisons    |
| `apps/api/src/bookings/change-seat-allocation.spec.ts` | Black-box availability: single-table fit, multi-table allocation, capacity rejection, immutability |

### Test Coverage Roadmap & Pending Tests

- **TODO(MH-06-whitebox):**
  - White-box unit tests for `booking-change-cutoff.ts`: decision condition coverage, MC/DC branch coverage.
  - White-box unit tests for `change-seat-allocation.ts`: tie-breaker comparison heuristics and table grouping permutations.
  - White-box unit tests for `bookings.service.ts`: internal transaction rollback verification, error logging paths, retry intervals for email dispatch.
  - White-box unit tests for `bookings.controller.ts`: NestJS exception filter pipeline and custom validation pipe bindings.
- **TODO(MH-06-graybox):**
  - Gray-box unit tests verifying Italian CET/CEST daylight saving transitions across the 48-hour boundary.
  - Gray-box unit tests verifying Prisma SQL row locking order (`SELECT ... FOR UPDATE OF s_other`) and foreign key cascade behavior.
  - Gray-box unit tests for HTTP response headers, CORS headers, and cookie serialization.
- **TODO(MH-06-integration):**
  - PostgreSQL integration tests (`test/booking-change.int-spec.ts`) verifying concurrent modification requests and row-level locking on real DB.
- **TODO(MH-06-e2e):**
  - Playwright API E2E tests (`e2e/tests/api/booking-change.spec.ts`) testing complete HTTP flows.
  - Playwright Web E2E tests (`e2e/tests/web/booking-change.spec.ts`) testing hiker UI interactions on the web client.

### Try it manually

1. Start stack with `docker compose up -d`.
2. Login as a hiker via `POST /api/auth/login`.
3. Create a booking for a slot 5 days in the future via `POST /api/bookings`.
4. Send `PATCH /api/bookings/:id` modifying party size: verify `200 OK` and updated tables.
5. Attempt `PATCH /api/bookings/:id` on a booking starting in < 48 hours: verify `422 Unprocessable Entity`.
6. Inspect Mailpit at `http://localhost:8025` to verify updated confirmation email.

## Open points

- **Timezone edge cases:** Confirm with PO whether the 48-hour cutoff is measured strictly against the slot start time or against 00:00 of the booked calendar day. (Currently modeled as 48 hours prior to slot start time).
- **Party requirements format:** When MH-05 structured party requirements array is merged, update `changeBookingSchema` to support the array format seamlessly.
