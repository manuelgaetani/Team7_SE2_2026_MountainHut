# MH-08 — Cancel a booking

|                |                                                                        |
| -------------- | ---------------------------------------------------------------------- |
| **Status**     | Unit test suite defined (black-box with stubs); implementation pending |
| **Depends on** | MH-01 (bookings domain, book a table), MH-03 (receive confirmation)    |

## User story

**Business value:** 950

As a hiker,  
I want to cancel a table booking,  
So that the hut can make the places available to other guests.

### Notes & Clarifications

- **Advance Notice Cutoff:** Cancellations must be requested with sufficient notice before the booked slot start time so the kitchen does not prepare unwanted food and staff can reallocate seats. Baseline policy assumes 24 hours prior to slot start.
- **Seat Liberation:** When a reservation is cancelled, all seats allocated across any tables are released immediately and become available for new bookings in that slot.
- **Ownership Check:** A hiker can only cancel their own reservations.
- **Clarifications:**
  - _Timezone calculation:_ The cancellation cutoff is evaluated against the slot's absolute start instant computed in the hut local timezone (`Europe/Rome`).
  - _Status eligibility:_ Both `CONFIRMED` and `PENDING` reservations can be cancelled. `CANCELLED` and `REJECTED` bookings cannot be cancelled again.
  - _Past slots:_ Bookings for slots that have already started or concluded in the past cannot be cancelled.

## Requirements

| #   | Requirement                                                                                                      | Status  | Implemented in                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| R1  | Hiker role restriction: only authenticated hikers can cancel bookings (`HIKER` role, RBAC)                       | Pending | `DELETE /api/bookings/:id`, `BookingsController.cancel`                 |
| R2  | Ownership check: hikers can only cancel reservations belonging to their own hiker profile                        | Pending | `BookingsService.cancel`                                                |
| R3  | Target identification: booking ID must be a positive integer within PostgreSQL limits                            | Pending | `cancelBookingSchema`, `packages/shared/src/booking-cancel.spec.ts`     |
| R4  | Cancellation cutoff: cancellations requested after the cutoff time are rejected (422)                            | Pending | `booking-cancellation-cutoff.ts`, `booking-cancellation-cutoff.spec.ts` |
| R5  | State eligibility: bookings in `CONFIRMED` or `PENDING` state can be cancelled; already cancelled rejected (409) | Pending | `booking-cancellation-policy.ts`, `booking-cancellation-policy.spec.ts` |
| R6  | Seat restoration: allocated table seats are restored to the slot table capacity atomically                       | Pending | `cancel-seat-release.ts`, `cancel-seat-release.spec.ts`                 |
| R7  | Atomic cancellation: booking status update and seat liberation occur within a single database transaction        | Pending | `BookingsService.cancel`, `BookingsRepository`                          |
| R8  | Not found handling: returns 404 if the booking does not exist                                                    | Pending | `BookingsService.cancel`, `NotFoundException`                           |

### Decisions

- **HTTP Method:** `DELETE /api/bookings/:id` is adopted for cancelling a booking.
- **Cutoff Policy:** Baseline cutoff is set at 24 hours prior to the slot start time. Requests submitted within the 24-hour window return `422 Unprocessable Entity`.
- **Concurrency & Atomicity:** The booking and its associated slot tables are locked using `SELECT ... FOR UPDATE` inside `prisma.$transaction` to guarantee consistency against concurrent modification or re-allocation.
- **Seat Release:** Seat liberation restores free seats without reallocating other unrelated bookings at shared tables.
- **Language:** All API error messages and UI feedback are in English.

## How it works

1. **Request Reception:** `DELETE /api/bookings/:id` receives the target booking ID along with the session cookie.
2. **Authentication & RBAC:** `AuthGuard` verifies the session cookie; `RolesGuard` verifies the caller is a `HIKER`.
3. **Payload Validation:** Path parameters and optional payload are validated against `cancelBookingSchema`.
4. **Transaction & Verification:**
   - Hiker profile existence is retrieved from the caller's session.
   - The booking record is loaded and verified for ownership (returns `403 Forbidden` if not owned).
   - If the booking does not exist, `404 Not Found` is returned.
   - Booking eligibility is evaluated via `decideCancellation`:
     - If already cancelled or rejected, returns `409 Conflict`.
     - If slot is in the past, returns `422 Unprocessable Entity`.
     - If within the cutoff window, returns `422 Unprocessable Entity`.
5. **Seat Liberation & Persistence:**
   - Table seat allocations for the booking are released.
   - Booking status is updated to `CANCELLED` in PostgreSQL.
   - The transaction commits, immediately freeing seats for future reservations.

## API

### `DELETE /api/bookings/:id`

Protected endpoint, requires session cookie of an authenticated `HIKER`.

| Param / Body Field | Type    | Rules                                         |
| ------------------ | ------- | --------------------------------------------- |
| `id` (path)        | integer | Positive integer, ID of the booking to cancel |
| `reason` (body)    | string  | Optional string, max 500 characters, no NUL   |

#### Example Request: Cancel a booking

```bash
curl -X DELETE -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/bookings/10 \
  -d '{
    "reason": "Family emergency, unable to attend"
  }'
```

Response `200 OK`:

```json
{
  "id": 10,
  "slotId": 1,
  "status": "CANCELLED",
  "freedSeats": 4
}
```

### Errors

| Status | When                                                          | `message`                                                     |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `400`  | Invalid booking ID (negative, zero, non-integer, float)       | `Invalid booking ID`                                          |
| `401`  | Missing or expired session cookie                             | `Unauthorized`                                                |
| `403`  | User is not a `HIKER`, lacks profile, or does not own booking | `You can only cancel your own bookings`                       |
| `404`  | Booking does not exist                                        | `Booking not found`                                           |
| `409`  | Booking is already cancelled or rejected                      | `Booking is already cancelled`                                |
| `422`  | Cancellation requested inside cutoff window or in past        | `Cancellations are only admitted up to 24 hours before start` |

## Code map

| Path                                                        | Content                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `docs/stories/MH-08-cancel-a-booking.md`                    | Living User Story documentation                                        |
| `packages/shared/src/bookings.ts`                           | Stub `cancelBookingSchema` and TypeScript type `CancelBookingInput`    |
| `packages/shared/src/booking-cancel.spec.ts`                | Black-box schema unit tests: BVA, equivalence partitioning             |
| `apps/api/src/bookings/booking-cancellation-cutoff.ts`      | Domain stub: cancellation cutoff rule (`isCancellationAdmitted`)       |
| `apps/api/src/bookings/booking-cancellation-cutoff.spec.ts` | Black-box domain unit tests: BVA on cancellation cutoff boundary       |
| `apps/api/src/bookings/cancel-seat-release.ts`              | Domain stub: seat release logic (`releaseCancelledSeats`)              |
| `apps/api/src/bookings/cancel-seat-release.spec.ts`         | Black-box domain unit tests: seat restoration, single & multi-table    |
| `apps/api/src/bookings/booking-cancellation-policy.ts`      | Domain stub: status & timing policy decision (`decideCancellation`)    |
| `apps/api/src/bookings/booking-cancellation-policy.spec.ts` | Black-box domain unit tests: eligibility, precedence, state partitions |

## Testing

Run unit tests:

```bash
# Shared package schema tests
npm run test -w @mountain-hut/shared -- src/booking-cancel.spec.ts

# API domain cutoff, seat release, and cancellation policy tests
npm run test -w @mountain-hut/api -- apps/api/src/bookings/booking-cancellation-cutoff.spec.ts
npm run test -w @mountain-hut/api -- apps/api/src/bookings/cancel-seat-release.spec.ts
npm run test -w @mountain-hut/api -- apps/api/src/bookings/booking-cancellation-policy.spec.ts
```

| Spec                                                        | Covers                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/shared/src/booking-cancel.spec.ts`                | Black-box schema tests: BVA for bookingId and reason, equivalence partitions, whitespace trimming    |
| `apps/api/src/bookings/booking-cancellation-cutoff.spec.ts` | Black-box domain cutoff: BVA on 24h boundary (exact, +1ms, -1min, midnight, month boundary)          |
| `apps/api/src/bookings/cancel-seat-release.spec.ts`         | Black-box seat release: single-table restoration, multi-table split restoration, immutability        |
| `apps/api/src/bookings/booking-cancellation-policy.spec.ts` | Black-box cancellation policy: status transitions (CONFIRMED/PENDING/CANCELLED/REJECTED), precedence |

### Test Coverage Roadmap & Pending Tests

- **TODO(MH-08-whitebox):**
  - White-box unit tests for `booking-cancellation-cutoff.ts`: decision condition coverage, MC/DC branch coverage.
  - White-box unit tests for `cancel-seat-release.ts`: branch coverage, table mapping loops, and defensive boundary assertions.
  - White-box unit tests for `booking-cancellation-policy.ts`: exhaustive predicate condition coverage.
  - White-box unit tests for `bookings.service.ts`: internal transaction rollback verification, error logging paths, audit trail.
  - White-box unit tests for `bookings.controller.ts`: NestJS exception filter pipeline and custom validation pipe bindings.
- **TODO(MH-08-graybox):**
  - Gray-box unit tests verifying Italian CET/CEST daylight saving transitions across the cancellation cutoff boundary.
  - Gray-box unit tests verifying Prisma SQL row locking order (`SELECT ... FOR UPDATE`) during cancellation transactions.
  - Gray-box unit tests for HTTP response headers and session cookie preservation.
- **TODO(MH-08-integration):**
  - PostgreSQL integration tests (`test/booking-cancel.int-spec.ts`) verifying concurrent cancellation requests and row-level locking on real DB.
  - Integration tests verifying that freed seats immediately become available to subsequent booking requests.
- **TODO(MH-08-e2e):**
  - Playwright API E2E tests (`e2e/tests/api/booking-cancel.spec.ts`) testing complete HTTP flows and RBAC enforcement.
  - Playwright Web E2E tests (`e2e/tests/web/booking-cancel.spec.ts`) testing hiker cancellation button, confirmation modal, and UI status updates.

### Try it manually

1. Start stack with `docker compose up -d`.
2. Login as a hiker via `POST /api/auth/login`.
3. Create a booking for a slot 5 days in the future via `POST /api/bookings`.
4. Send `DELETE /api/bookings/:id` to cancel the booking: verify `200 OK` and status `CANCELLED`.
5. Check `GET /api/slots`: verify free seats have increased by the party size.
6. Attempt `DELETE /api/bookings/:id` again: verify `409 Conflict` (already cancelled).

## Open points

- **Cutoff duration:** Confirm with PO whether the cancellation cutoff window is 24 hours, 48 hours (matching MH-06 changes), or 2 hours (matching MH-01 booking lead time). Modeled with a 24-hour baseline.
