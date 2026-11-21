# MH-06 — Change a booking

|                |                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------- |
| **Status**     | API and web app complete; web e2e tests pending                                                 |
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

Answers of the course issues:

- **#38 and #48:** every change is treated as a new booking. The seats of the booking are released and the tables are assigned again with the MH-01 rules, even when the party still fits at its tables or only the requirements change.
- **#41:** every change is notified by email.
- **#43:** a change is admitted at least 48 hours before the meal, for the booked slot and for a new one.

Team assumption:

- _Partial changes:_ a hiker may change one, two or all of `slotId` (date and time), `partySize` and `requirements`. An empty change is rejected.

## Requirements

| #   | Requirement                                                                                            | Status | Implemented in                                                                          |
| --- | ------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------- |
| R1  | Hiker role restriction: only authenticated hikers can modify their bookings (`HIKER` role, RBAC)       | Done   | `BookingsController.change` (`@Roles('HIKER')`)                                         |
| R2  | Ownership check: hikers can only modify reservations belonging to their own hiker profile              | Done   | `BookingsService.change`                                                                |
| R3  | Modifiable fields: date/time (via target `slotId`), `partySize`, `requirements` (the MH-05 list)       | Done   | `changeBookingSchema`, `BookingsService.change`                                         |
| R4  | Input validation: non-empty change, positive ids within DB limits, party size >= 1, valid list         | Done   | `changeBookingSchema`, `partyRequirementSchema`                                         |
| R5  | 48-hour cutoff: changes requested less than 48 hours before the booked slot are rejected               | Done   | `isChangeAdmitted` (`booking-change-cutoff.ts`)                                         |
| R6  | Target slot cutoff: the new slot must start at least 48 hours after the change (422, course issue #43) | Done   | `BookingsService.change` (`isChangeAdmitted` on the new slot)                           |
| R7  | Automatic verification of availability: every change seats the party again (issues #38, #48)           | Done   | `BookingsService.change`, `canAccommodatePartyChange` (MH-01 `allocateSeats`)           |
| R8  | Atomic table reallocation: table assignments are recalculated and updated in a single transaction      | Done   | `BookingsService.change`, `BookingsRepository`                                          |
| R9  | Not found handling: returns 404 if booking or target slot does not exist                               | Done   | `BookingsService.change`                                                                |
| R10 | The hiker is notified of the change by email (issue #41)                                               | Done   | `BookingsService.change`, `NotificationService.sendBookingChange`, `bookingChangeEmail` |

### Decisions

- **HTTP method.** `PATCH /api/bookings/:id` for partial changes.
- **48-hour cutoff.** A change less than 48 hours before the booked slot answers `422`. It applies to every change, also when only the requirements change. A new slot must also start at least 48 hours from now (issue #43), otherwise `422`.
- **Tables after a change.** Every change is a new booking (issues #38, #48): the booking's own seats count as free, and the party is seated again on all the tables of the slot with the MH-01 rules (`allocateSeats`), even when it still fits at its tables, when the party size stays the same or when only the requirements change. If the seats are not enough, `409` and nothing changes.
- **Requirements.** The MH-05 list (`{ allergies, description }`, at most 20 entries). A list sent in the change replaces the old one as a whole; `[]` removes them all; without the field they stay as they are. They are stored in `party_requirements`, in the order of the list.
- **One booking per slot.** Moving to a slot where the hiker already has an active booking answers `409`, like `POST /api/bookings`.
- **Rejected bookings.** A `REJECTED` booking cannot be changed (`409`).
- **Status.** A change does not touch the status: a `CONFIRMED` booking stays confirmed.
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
   5. for a new slot: checks that it starts at least 48 hours from now (`422`) and that the hiker has no other booking there (`409`);
   6. reads the free seats of the target slot without this booking and seats the party again with `canAccommodatePartyChange` (`409` if they are not enough);
   7. deletes the old table assignments, updates the booking, and stores the new assignments. The old assignments go first: `booking_tables` points to the booking through `(booking_id, slot_id)`, so they cannot follow it to a new slot;
   8. replaces the requirements when the change has a list, otherwise reads the current ones for the answer.
3. After the commit, the "booking changed" email is sent to the hiker with the new details.

## API

### `PATCH /api/bookings/:id`

Protected endpoint: session cookie of a `HIKER`.

| Param / Body field           | Type    | Rules                                                                  |
| ---------------------------- | ------- | ---------------------------------------------------------------------- |
| `id` (path)                  | integer | ID of the booking to change                                            |
| `slotId`                     | integer | Optional, positive, at most `2147483647`: the new slot (date and time) |
| `partySize`                  | integer | Optional, positive: checked against the free seats                     |
| `requirements`               | array   | Optional, at most 20 entries: the whole new list; `[]` removes them    |
| `requirements[].allergies`   | boolean | `true` when special care is needed                                     |
| `requirements[].description` | string  | Trimmed, 1–500 characters, no NUL byte                                 |

At least one of `slotId`, `partySize` and `requirements` must be present.

```bash
curl -X PATCH -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/bookings/10 \
  -d '{
    "partySize": 4,
    "requirements": [
      { "allergies": false, "description": "2 vegans" },
      { "allergies": true, "description": "1 peanut allergy" }
    ]
  }'
```

Response `200 OK`:

```json
{
  "id": 10,
  "slotId": 1,
  "partySize": 4,
  "status": "CONFIRMED",
  "requirements": [
    { "allergies": false, "description": "2 vegans" },
    { "allergies": true, "description": "1 peanut allergy" }
  ],
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
| `422`  | The new slot starts in less than 48 hours                 | `The new slot must start at least 48 hours from now`              |

## Web app

**Route:** `/bookings` ("My bookings", in the navigation bar of a hiker). Visitors without a session are asked to log in; staff accounts are told they have no bookings.

- **List.** `GET /api/bookings/me` gives the upcoming bookings of the hiker, the soonest first: date, time, party, status and the MH-05 requirements (with an "Allergies" badge). Tabs split upcoming and cancelled bookings. A `CONFIRMED` or `PENDING` booking shows **Modify** and **Cancel** (Cancel is wired by MH-08).
- **48-hour rule.** Less than 48 hours before the slot, **Modify** is disabled and the card says _"This booking can no longer be changed: changes are admitted up to 48 hours before the booked date."_ The API checks the same rule (`422`); the page only spares a request that would be refused.
- **Change dialog** (`ModifyBookingDialog`). It starts from the current details: date and time (selects over the upcoming slots), number of people and the list of requirements (one row each, with its "Allergies" flag; rows can be added up to 20 and removed). The booked slot can always be kept; another slot can be chosen only when it has seats and starts at least 48 hours from now, otherwise it is shown as `(full)`, `(too late)` or `(within 48 hours)` and disabled.
- **What is sent.** `PATCH /api/bookings/:id` with only the details that changed (`ChangeBookingInput` of the shared package); the requirements are sent as the whole new list (`[]` when all rows are removed). Nothing changed: _"Change at least one detail of the booking."_ Party size and empty or too long requirements are checked in the form first.
- **Feedback.** While saving the button says _"Saving changes…"_. On success the dialog closes, the list and the slots are loaded again and the card says _"Booking updated. We'll email you the new details."_ On `403`, `404`, `409` or `422` the dialog stays open and shows the message of the API (for example _"Insufficient seats available for the updated booking"_); on `401` it asks to log in again; any other error gives a generic message.

## Data model

No new table or column. The requirements live in the MH-05 table `party_requirements`, and a change replaces the rows of the booking. The `notification_type` enum gets the value `BOOKING_CHANGE`, for the change email.

Migrations:

- `20261112120000_add_booking_change_notification`

## Code map

| Path                                                                        | Content                                                                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shared/src/bookings.ts`                                           | `changeBookingSchema`, `ChangeBookingInput` (the answer is a `BookingResult`)                                                  |
| `apps/api/src/bookings/domain/booking-change-cutoff.ts`                     | 48-hour rule: `isChangeAdmitted`                                                                                               |
| `apps/api/src/bookings/domain/change-seat-allocation.ts`                    | Tables after a change: `canAccommodatePartyChange` (MH-01 `allocateSeats`)                                                     |
| `apps/api/src/bookings/presentation/bookings.controller.ts`                 | `PATCH /api/bookings/:id` (`change`)                                                                                           |
| `apps/api/src/bookings/application/bookings.service.ts`                     | `change`: checks, locks, new tables, requirements and change email                                                             |
| `apps/api/src/bookings/application/bookings.repository.port.ts`             | `LockedBooking`, `BookingChange` and the repository methods used by `change`                                                   |
| `apps/api/src/bookings/infrastructure/prisma-bookings.repository.ts`        | `lockBooking`, `deleteBookingTables`, `updateBooking`, `findRequirements`, `replaceRequirements`, free seats without a booking |
| `apps/api/src/bookings/application/confirmation-sender.ts`                  | `sendChange`: the change email after the commit                                                                                |
| `apps/api/src/notifications/infrastructure/booking-confirmation.adapter.ts` | `notifyChange`                                                                                                                 |
| `apps/api/src/notifications/notification.service.ts`                        | `sendBookingChange`                                                                                                            |
| `apps/api/src/notifications/templates/booking-confirmation.ts`              | `bookingChangeEmail`: "Booking n. X changed" with the new details                                                              |
| `apps/api/prisma/migrations/20261112120000_add_booking_change_notification` | `BOOKING_CHANGE` notification type                                                                                             |
| `packages/shared/src/booking-change.spec.ts`                                | Black-box schema unit tests: BVA, equivalence partitioning                                                                     |
| `apps/api/src/bookings/domain/booking-change-cutoff.spec.ts`                | Black-box domain unit tests: BVA on 48h boundary                                                                               |
| `apps/api/src/bookings/domain/change-seat-allocation.spec.ts`               | Black-box domain unit tests: availability & multi-table allocation                                                             |
| `apps/api/test/booking-change.int-spec.ts`                                  | Integration tests on PostgreSQL                                                                                                |
| `e2e/tests/api/booking-change.spec.ts`                                      | E2E black-box API tests for booking change REST endpoint                                                                       |
| `e2e/tests/web/booking-change.spec.ts`                                      | E2E black-box Web UI tests for hiker booking modification workflow                                                             |
| `packages/shared/src/bookings.ts`                                           | `MyBooking`, `MyBookingStatus`: a booking as listed in `GET /api/bookings/me`                                                  |
| `apps/api/src/bookings/application/list-my-bookings.ts`                     | `ListMyBookings`: upcoming bookings of the logged hiker                                                                        |
| `apps/api/src/bookings/presentation/bookings.controller.ts`                 | `GET /api/bookings/me` (`listMine`)                                                                                            |
| `apps/api/src/bookings/infrastructure/prisma-bookings.repository.ts`        | `findUpcomingBookingsOfHiker`, with the requirements read from `party_requirements`                                            |
| `apps/web/src/pages/MyBookingsPage.tsx`                                     | `/bookings`: tabs, list, login and staff notices                                                                               |
| `apps/web/src/components/MyBookingCard.tsx`                                 | One booking: details, requirements, Modify and Cancel, 48-hour notice, "Booking updated"                                       |
| `apps/web/src/components/ModifyBookingDialog.tsx`                           | The change form and the `PATCH` request                                                                                        |
| `apps/web/src/lib/bookingChange.ts`                                         | `isChangeOpen`: the 48-hour rule in the web app                                                                                |
| `apps/web/src/api/bookings.ts`, `useBookings.ts`                            | `fetchMyBookings`, `changeBooking`, `useMyBookings`, `useChangeBooking`                                                        |

## Testing

```bash
# Unit tests
npm run test -w @mountain-hut/shared -- src/booking-change.spec.ts
npm run test -w @mountain-hut/api -- src/bookings/domain/booking-change-cutoff.spec.ts src/bookings/domain/change-seat-allocation.spec.ts src/bookings/application/bookings.service.spec.ts

# Integration tests against PostgreSQL
docker compose up -d db
npm run test:int -w @mountain-hut/api -- test/booking-change.int-spec.ts

# E2E tests, against the running Docker stack
docker compose up --build -d --wait
npm run e2e:api -w @mountain-hut/e2e -- tests/api/booking-change.spec.ts
npm run e2e:web -w @mountain-hut/e2e -- tests/web/booking-change.spec.ts
```

| Spec                                                                      | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shared/src/booking-change.spec.ts`                              | Black-box, white-box & gray-box schema tests: BVA, equivalence partitions, Zod pipeline/path checks, count bounds, PostgreSQL INT4/TEXT alignment                                                                                                                                                                                                                                                                                                                                                      |
| `apps/api/src/bookings/domain/booking-change-cutoff.spec.ts`              | Black-box, white-box & gray-box domain cutoff: BVA on 48h boundary, branch/condition/MC-DC coverage (`Invalid Date`, offsets), CET/CEST DST transitions                                                                                                                                                                                                                                                                                                                                                |
| `apps/api/src/bookings/domain/change-seat-allocation.spec.ts`             | Black-box, white-box & gray-box availability: single-table fit, multi-table allocation, tie-breakers, order independence, `slot_tables` capacity invariants                                                                                                                                                                                                                                                                                                                                            |
| `apps/api/src/bookings/application/bookings.service.spec.ts`              | `change`: re-seating on every change, 48 hours for the booked and the new slot, requirements replaced or kept, refusals, transaction order                                                                                                                                                                                                                                                                                                                                                             |
| `apps/api/src/bookings/presentation/bookings.controller.spec.ts`          | `PATCH /bookings/:id` and `GET /bookings/me`: RBAC before body validation, `PartyRequirement[]` bounds, empty list clearing, status/error mapping                                                                                                                                                                                                                                                                                                                                                      |
| `apps/api/src/bookings/infrastructure/prisma-bookings.repository.spec.ts` | Free seats of a slot without the booking being changed, booking lock, requirements read and replaced                                                                                                                                                                                                                                                                                                                                                                                                   |
| `apps/api/test/booking-change.int-spec.ts`                                | On PostgreSQL: party seated again with the MH-01 rules on every change (issues #38, #48), refused increase unchanged, freed seats, move to another slot, move + size, same-slot and missing-slot refusals, requirements, 48-hour boundary and refusals for the booked and the new slot (issue #43), ownership, rejected booking, parallel changes and bookings without overbooking, no deadlock on swapped slots, change email `BOOKING_CHANGE` sent or failed (issue #41), rollback on a failed write |
| `e2e/tests/api/booking-change.spec.ts`                                    | Black-box API: date/time change, party size, requirements list, 48h cutoff (422), target slot cutoff, availability conflict (409), RBAC, Mailpit email                                                                                                                                                                                                                                                                                                                                                 |
| `e2e/tests/web/booking-change.spec.ts`                                    | Black-box Web: UI booking edit, slot picker, 48h cutoff warning, capacity conflict notice, login redirection, keyboard accessibility, cancel discard, unchanged validation, live slot options                                                                                                                                                                                                                                                                                                          |
| `apps/web/src/api/bookings.test.tsx`                                      | HTTP client (`fetchSlots`, `createBooking`, `fetchMyBookings`, `changeBooking`) and TanStack Query cache invalidation (`useChangeBooking`, `useCreateBooking`)                                                                                                                                                                                                                                                                                                                                         |
| `apps/web/src/lib/bookingChange.test.ts`                                  | 48-hour rule: exact boundary, 1ms inside, rollover, default `now` clock, already started                                                                                                                                                                                                                                                                                                                                                                                                               |
| `apps/web/src/pages/MyBookingsPage.test.tsx`                              | List, tabs (including switching back), empty states, errors (401/403/500/network); Modify disabled with the notice within 48 hours                                                                                                                                                                                                                                                                                                                                                                     |
| `apps/web/src/components/MyBookingCard.test.tsx`                          | Card states (`CONFIRMED`, `PENDING`, `REJECTED`, `CANCELLED`), requirements & Allergies badge, 48-hour rule, Modify dialog lifecycle & updated status banner                                                                                                                                                                                                                                                                                                                                           |
| `apps/web/src/components/ModifyBookingDialog.test.tsx`                    | Dialog: current details, date/time selects (`full`, `too late`, `within 48 hours`, no available time), form checks, only changed details sent, empty requirements `[]`, success & API/network errors, cache reload                                                                                                                                                                                                                                                                                     |
| `apps/api/src/bookings/application/list-my-bookings.spec.ts`              | `ListMyBookings`: hiker profile lookup, time zone and now                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `apps/api/src/bookings/infrastructure/prisma-bookings.repository.spec.ts` | `findUpcomingBookingsOfHiker`: mapping, requirements from `party_requirements`, upcoming only, order                                                                                                                                                                                                                                                                                                                                                                                                   |

### Test Coverage Roadmap & Pending Tests

- **Completed (unit, integration & e2e):**
  - `packages/shared/src/booking-change.spec.ts` (Zod pipeline, `MAX_REQUIREMENTS_COUNT`, PostgreSQL INT4/NUL-byte alignment).
  - `apps/api/src/bookings/domain/booking-change-cutoff.spec.ts` (branch/condition/MC-DC coverage, CET/CEST DST transitions).
  - `apps/api/src/bookings/domain/change-seat-allocation.spec.ts` (tie-breakers, heuristics, `slot_tables` consistency invariants).
  - `apps/api/src/bookings/presentation/bookings.controller.spec.ts` (`PATCH /bookings/:id` RBAC order and MH-05 `PartyRequirement[]` validation).
  - `apps/web/src/api/bookings.test.tsx`, `apps/web/src/components/MyBookingCard.test.tsx`, `apps/web/src/components/ModifyBookingDialog.test.tsx`, `apps/web/src/pages/MyBookingsPage.test.tsx`, `apps/web/src/lib/bookingChange.test.ts`.
  - `e2e/tests/web/booking-change.spec.ts` (all 10 scenarios implemented and passing: R1 login prompt, R3 modify party size and requirements, R3 & R8 slot change, R5 48-hour cutoff notice, R7 seat conflict notice, cancel edit revert, keyboard accessibility, unchanged validation, screen reader 48h deadline, time slot availability indicators).
  - `e2e/tests/api/booking-change.spec.ts` (all 33 scenarios passing, including atomic concurrent modifications competing for last seats and rejection of changes on rejected bookings).
- **Future Backlog (post-MVP / not yet in system):**
  - Seasonal closure date checks, audit log storage table, rate limiting middleware.

### Try it manually

1. Start the stack with `docker compose up --build -d` and create slots as staff (`/staff/slots`).
2. Log in as a hiker (`POST /api/auth/login`, for example from Swagger at http://localhost:3000/api/docs).
3. Book a slot at least 3 days ahead with `POST /api/bookings`.
4. Send `PATCH /api/bookings/:id` with a new `partySize`: `200 OK` with the new tables, chosen again with the MH-01 rules. Ask for more seats than the slot has: `409`, and the booking is unchanged.
5. Send `PATCH /api/bookings/:id` with a `requirements` list: the answer has the new list; send `[]` and the list is empty.
6. Send `PATCH /api/bookings/:id` with the `slotId` of another slot at least 48 hours away: the seats move to the new slot (check `freeSeats` in `GET /api/slots`). A slot less than 48 hours away: `422`.
7. Change a booking of a slot starting in less than 48 hours: `422`.
8. Open Mailpit at http://localhost:8025: after each change there is a "Booking n. X changed" email with the new details.
9. In the web app, log in as the hiker and open http://localhost:3000/bookings: press **Modify** on a booking, change the number of people, add a requirement with "Allergies" ticked and confirm. The card shows the new details and "Booking updated". A booking less than 48 hours away has Modify disabled and the 48-hour notice.

## Open points

- **48 hours in the browser:** the web app reads the slot date and time as local time of the browser, so a hiker outside the hut's time zone may see Modify enabled a little longer or shorter; the API is the authority and answers `422`.
- **Requirements editor:** the change dialog has its own rows; it could reuse the MH-05 `RequirementsEditor` in a later refactor.
- **`canAccommodatePartyChange`:** its optional `current` parameter (keep the party at its tables) is no longer used by the service since issues #38 and #48; it is kept for its white-box tests and can be removed together with them.
