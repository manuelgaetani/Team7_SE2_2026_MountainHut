# MH-09 — Repeat a weekly schedule

|                |                                                                                  |
| -------------- | -------------------------------------------------------------------------------- |
| **Status**     | Backend complete; web page pending; E2E tests to align with course issue #45     |
| **Depends on** | MH-02 (define slot capacity and tables), MH-58 (authentication and `RolesGuard`) |

## User story

**Business value:** 945

As an employee,  
I want to copy or repeat a schedule across multiple weeks,  
So that I do not have to configure recurring slots individually.

### Notes & Clarifications

- **Weekly Recurrence Pattern:** Mountain huts often operate on recurring weekly meal service patterns (e.g. fixed lunch and dinner services on weekdays and weekends). Staff need a fast way to project a configured weekly schedule forward across multiple weeks.
- **Table Layout Duplication:** Each copied time slot retains its exact time range (`startTime`, `endTime`) and duplicates all associated tables and seat capacities (`tableNumber`, `seats`), creating fully independent slots.
- **Day-of-Week Mapping:** A slot on day $D$ of the source week is projected to day $D + 7k$ for each week $k \in [1, \text{repeatWeeks}]$.
- **Target week already scheduled (course issue #45, 2026-11-12):** a weekly schedule cannot be copied onto an existing schedule if it has reservations. If it has none, the copy completely replaces the existing one.
- **Adjusting the copies:** "they can later be adjusted if required" refers to MH-19 (modify a slot), not to this story (course issue #45).
- **Empty Source Week:** If the selected source week contains no slots, the operation is rejected with `422 Unprocessable Entity`.

## Requirements

| #   | Requirement                                                                                                   | Status  | Implemented in                                                   |
| --- | ------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| R1  | Staff role restriction: only authenticated staff (`EMPLOYEE` and `WARDEN`) can repeat weekly schedules        | Done    | `POST /api/slots/repeat-weekly`, `SlotsController.repeatWeekly`  |
| R2  | Source week specification: staff selects a source start date defining the 7-day template period               | Done    | `repeatWeeklyScheduleSchema`, `SlotsService.repeatWeekly`        |
| R3  | Repeat duration: staff selects number of future weeks to repeat across ($1 \le \text{repeatWeeks} \le 12$)    | Done    | `repeatWeeklyScheduleSchema` (`MAX_REPEAT_WEEKS`)                |
| R4  | Slot & table replication: all slots and table layouts in source period are duplicated into target weeks       | Done    | `projectWeeklySchedule`, `SlotsService.repeatWeekly`             |
| R5  | A target week with reservations (pending or confirmed bookings) cannot be replaced: `409`, nothing is written | Done    | `SlotsRepository.findReservedDates`, `SlotsService.repeatWeekly` |
| R6  | Empty source validation: rejects repetition with 422 if the source week has no time slots configured          | Done    | `SlotsService.repeatWeekly`, `UnprocessableEntityException`      |
| R7  | Input bounds validation: rejects non-existent dates, non-positive or excessive week counts with 400           | Done    | `repeatWeeklyScheduleSchema`, `ZodValidationPipe`                |
| R8  | Atomic transaction: bulk slot and table duplication executes atomically within `prisma.$transaction`          | Done    | `SlotsService.repeatWeekly`                                      |
| R9  | Web UI controls: staff page `/staff/slots` provides modal/form to trigger and confirm schedule repeat         | Pending | `RepeatScheduleDialog`, `/staff/slots` page                      |
| R10 | A target week without reservations is replaced completely: its slots are deleted, then the copies are created | Done    | `SlotsRepository.deleteSlots`, `SlotsService.repeatWeekly`       |

### Decisions

- **HTTP Method:** `POST /api/slots/repeat-weekly` handles the bulk generation.
- **No conflict strategy.** The first draft of this contract had a `conflictStrategy` (`SKIP` / `FAIL`). The product owner's answer to course issue #45 replaced it: a target week is either replaced completely or, if it has reservations, not touched. A `conflictStrategy` sent by a client is ignored.
- **What a reservation is.** A booking that takes seats: `PENDING` or `CONFIRMED`. Bookings that take no seats (`REJECTED`) do not block the copy and are deleted with their slot.
- **The target weeks are the 7-day periods after the source.** Week $k$ goes from $\text{sourceStartDate} + 7k$ to $\text{sourceStartDate} + 7k + 6$. The source date does not have to be a Monday.
- **All or nothing.** If one target week has reservations, no week is changed, and the answer names the first week with reservations.
- **Locks.** The copy locks every day of the target weeks (PostgreSQL advisory locks, in date order), so two copies onto the same days run one after the other. The key is the one of the MH-02 overlap check (`slots-day:YYYY-MM-DD`): once both are on the same branch, creating a slot also waits for a running copy.
- **Slots in the past.** The story does not forbid copying from or into past weeks, so it is allowed.
- **Day-of-Week Preservation:** Dates are computed using strict day offsets ($+7, +14, \dots$) in the hut timezone (`Europe/Rome`).
- **Independent Capacity:** Replicated slots have no booking links to their source; bookings made on a replicated slot do not impact the source or other weeks.
- **Language:** All API error messages, schedule notifications, and UI labels are in English.

## How it works

1. **Request Reception:** `POST /api/slots/repeat-weekly` receives `sourceStartDate` and `repeatWeeks` with the session cookie.
2. **Authentication & RBAC:** `AuthGuard` verifies the session cookie; `RolesGuard` verifies the caller is an `EMPLOYEE` or a `WARDEN` (hikers receive `403 Forbidden`).
3. **Validation:** `ZodValidationPipe` validates the date and the number of weeks ($1 \dots 12$).
4. **Transaction:** everything below runs in one `prisma.$transaction`.
5. **Locks:** every day of the target weeks is locked, in date order.
6. **Source Retrieval:** the slots and tables from `sourceStartDate` to `sourceStartDate + 6 days`. If there are none: `422`.
7. **Reservations:** if a slot of the target weeks has a pending or confirmed booking: `409`, nothing is written.
8. **Replacement:** the slots of the target weeks are deleted, with their tables and their bookings that take no seats.
9. **Copies:** each source slot is created again, with a copy of its tables, on the same weekday of each target week (`projectWeeklySchedule`).
10. **Response:** `201 Created` with the number of created and replaced slots and the created slots, ordered by date and start time.

## API

### `POST /api/slots/repeat-weekly`

Protected endpoint, requires session cookie of an authenticated `EMPLOYEE` or `WARDEN`.

| Field             | Type    | Rules                                                                |
| ----------------- | ------- | -------------------------------------------------------------------- |
| `sourceStartDate` | string  | `YYYY-MM-DD`, valid calendar date (start of the 7-day source period) |
| `repeatWeeks`     | integer | Positive integer, minimum 1, maximum 12                              |

#### Example Request: Repeat schedule for 2 weeks

```bash
curl -X POST -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/slots/repeat-weekly \
  -d '{
    "sourceStartDate": "2035-06-04",
    "repeatWeeks": 2
  }'
```

Response `201 Created`:

```json
{
  "targetWeeks": 2,
  "createdSlotsCount": 6,
  "replacedSlotsCount": 0,
  "createdSlots": [
    {
      "id": 101,
      "date": "2035-06-11",
      "startTime": "12:00",
      "endTime": "14:00",
      "totalSeats": 10,
      "tables": [
        { "tableNumber": 1, "seats": 4 },
        { "tableNumber": 2, "seats": 6 }
      ]
    }
  ]
}
```

### Errors

| Status | When                                                                     | `message`                                                                        |
| ------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `400`  | Invalid body (malformed date, `repeatWeeks` not an integer from 1 to 12) | `Invalid data` (details in `issues`)                                             |
| `401`  | Missing or expired session cookie                                        | `Not authenticated`                                                              |
| `403`  | Authenticated user is a `HIKER`                                          | `Operation not allowed for your role`                                            |
| `409`  | A slot of a target week has reservations                                 | `The week starting YYYY-MM-DD has reservations: its schedule cannot be replaced` |
| `422`  | Source week contains no slots to copy                                    | `Source week contains no time slots to repeat`                                   |

## Web app

- **Route:** `/staff/slots`
- **Component:** `RepeatWeeklyScheduleDialog` / action button in `SlotSchedule` toolbar.
- **Controls:**
  - Date input displaying the selected source week.
  - Number input for `repeatWeeks` (default: 1, range: 1–12).
  - A warning that the slots already in the target weeks are replaced.
  - "Confirm and repeat schedule" action button.
- **Feedback:**
  - Success banner: `Schedule successfully repeated across X weeks: Y slots created.`
  - Navigation: day picker updates allow staff to immediately view the replicated schedules on subsequent weeks.

## Code map

| Path                                                    | Content                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `docs/stories/MH-09-repeat-a-weekly-schedule.md`        | Living User Story documentation                                                       |
| `packages/shared/src/slots.ts`                          | `repeatWeeklyScheduleSchema`, `MAX_REPEAT_WEEKS`, `RepeatWeeklyScheduleResult`        |
| `apps/api/src/slots/repeat-schedule-calculator.ts`      | `projectWeeklySchedule` and `addDays`: dates of the copies                            |
| `apps/api/src/slots/slots.controller.ts`                | `POST /api/slots/repeat-weekly`                                                       |
| `apps/api/src/slots/slots.service.ts`                   | `SlotsService.repeatWeekly`: locks, checks, replacement and copies in one transaction |
| `apps/api/src/slots/slots.repository.ts`                | `lockDay`, `findBetween`, `findReservedDates`, `deleteSlots`                          |
| `packages/shared/src/repeat-weekly-schedule.spec.ts`    | Black-box schema unit tests: BVA, EP for dates and repeatWeeks                        |
| `apps/api/src/slots/repeat-schedule-calculator.spec.ts` | Black-box domain unit tests: date math, month/year transitions                        |
| `apps/api/test/repeat-schedule.int-spec.ts`             | PostgreSQL integration tests                                                          |
| `e2e/tests/api/repeat-weekly-schedule.spec.ts`          | Black-box API E2E tests: RBAC, multi-week replication, conflicts                      |
| `e2e/tests/web/repeat-weekly-schedule.spec.ts`          | Black-box Web E2E tests: employee workflow, modal, validation, UI                     |

## Testing

Run unit tests:

```bash
# Shared package schema tests
npm run test -w @mountain-hut/shared -- src/repeat-weekly-schedule.spec.ts

# API domain calculator tests
npm run test -w @mountain-hut/api -- src/slots/repeat-schedule-calculator.spec.ts

# Integration tests against PostgreSQL
docker compose up -d db
npm run test:int -w @mountain-hut/api -- test/repeat-schedule.int-spec.ts
```

Run E2E tests:

```bash
# Start Docker stack
docker compose up -d

# API E2E tests for MH-09
npm run e2e:api -w @mountain-hut/e2e -- e2e/tests/api/repeat-weekly-schedule.spec.ts

# Web UI E2E tests for MH-09
npm run e2e:web -w @mountain-hut/e2e -- e2e/tests/web/repeat-weekly-schedule.spec.ts

# Run entire E2E suite
npm run test:e2e
```

| Spec                                                    | Covers                                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/repeat-weekly-schedule.spec.ts`    | Black-box schema tests: BVA for repeatWeeks (1..12), sourceStartDate format & calendar validity, conflictStrategy ignored                                                                                           |
| `apps/api/src/slots/repeat-schedule-calculator.spec.ts` | Black-box projection tests: multi-day/multi-week date mapping ($D + 7k$), table layout preservation, month/year/leap day boundary transitions                                                                       |
| `apps/api/src/slots/slots.service.spec.ts`              | `repeatWeekly` with a mocked repository: day locks in order, source and target ranges, copies with tables, replacement, `409` and `422` without writes                                                              |
| `apps/api/src/slots/slots.repository.spec.ts`           | `lockDay` bound value, `findBetween`, `findReservedDates` filter, `deleteSlots` order                                                                                                                               |
| `apps/api/src/slots/slots.controller.spec.ts`           | `POST /slots/repeat-weekly`: staff only, `400` on invalid bodies, `conflictStrategy` not passed on                                                                                                                  |
| `apps/api/test/repeat-schedule.int-spec.ts`             | On PostgreSQL: copies over 2 weeks with tables, 7-day source range, replacement, `PENDING`/`CONFIRMED` bookings block with no writes, rejected bookings deleted, empty source, parallel copies                      |
| `e2e/tests/api/repeat-weekly-schedule.spec.ts`          | Black-box API: RBAC (401, 403, 201), multi-day replication, exact table layouts, conflict handling (`SKIP`/`FAIL`, to be replaced by the rule of course issue #45), empty source week (422), input validation (400) |
| `e2e/tests/web/repeat-weekly-schedule.spec.ts`          | Black-box Web: staff login, modal interaction, day navigation, schedule replication verification, validation feedback                                                                                               |

### Test Coverage Roadmap & Pending Tests

- **TODO(MH-09-whitebox):**
  - White-box unit tests for `repeat-schedule-calculator.ts`: decision condition coverage, MC/DC branch coverage.
  - White-box unit tests for `slots.service.ts`: transaction rollback on intermediate database insertion failure.
- **TODO(MH-09-graybox):**
  - Gray-box unit tests verifying database row locking during batch slot insertions.
  - Gray-box unit tests verifying unique constraint collision mapping (`slots_date_start_time_end_time_key`).
- **E2E to align with course issue #45:** the API tests of `SKIP` and `FAIL` (`skippedSlotsCount`) describe the first draft of the contract. They should check instead that a target week without reservations is replaced (`replacedSlotsCount`) and that one with reservations answers `409`.
- **TODO(MH-09-e2e):**
  - Planned API future scenarios:
    - Handle daylight saving time (CET to CEST) shifts across weekly repeats.
    - Selective day-of-week repetition (e.g. repeat only weekend schedules).
    - Database transaction rollback verification during bulk insertion failure.
    - Seasonal blackout / holiday closure exclusion filtering.
    - Bulk undo/rollback endpoint to remove a repeated schedule batch.
  - Planned Web future scenarios:
    - Keyboard accessibility (focus trap, Escape key dismiss) in repeat schedule modal.
    - Conflict preview dialog showing visual calendar timeline of overlapping slots.
    - Screen reader ARIA live announcement on completion of bulk schedule creation.
    - Visual progress indicator for large bulk operations.
    - Undo action pill in notification toast.

### Try it manually

1. Start stack with `docker compose up -d`.
2. Sign in as an employee at `http://localhost:3000/login`.
3. Navigate to `/staff/slots`.
4. Create a few lunch and dinner slots on Monday and Wednesday with specific table layouts.
5. Click "Repeat weekly schedule", choose 2 weeks, and click "Confirm and repeat".
6. Navigate 7 days forward: verify the exact same slots and tables are created.
7. Navigate 14 days forward: verify the slots are created.
8. Sign in as a hiker and verify that the new slots are listed and bookable at `/book`.
