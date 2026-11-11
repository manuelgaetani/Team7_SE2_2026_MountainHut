# MH-09 — Repeat a weekly schedule

|                |                                                                                  |
| -------------- | -------------------------------------------------------------------------------- |
| **Status**     | E2E test suite defined (black-box); implementation pending                       |
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
- **Conflict Handling:**
  - `SKIP` (default): skips any target slot that already exists with the same date and time range, continuing to create all non-conflicting slots.
  - `FAIL`: aborts the operation and returns `409 Conflict` if any target slot already exists.
- **Empty Source Week:** If the selected source week contains no slots, the operation is rejected with `422 Unprocessable Entity`.

## Requirements

| #   | Requirement                                                                                                | Status  | Implemented in                                                  |
| --- | ---------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------- |
| R1  | Staff role restriction: only authenticated staff (`EMPLOYEE` and `WARDEN`) can repeat weekly schedules     | Pending | `POST /api/slots/repeat-weekly`, `SlotsController.repeatWeekly` |
| R2  | Source week specification: staff selects a source start date defining the 7-day template period            | Pending | `repeatWeeklyScheduleSchema`, `POST /api/slots/repeat-weekly`   |
| R3  | Repeat duration: staff selects number of future weeks to repeat across ($1 \le \text{repeatWeeks} \le 12$) | Pending | `repeatWeeklyScheduleSchema`                                    |
| R4  | Slot & table replication: all slots and table layouts in source period are duplicated into target weeks    | Pending | `SlotsService.repeatWeekly`, `SlotsRepository`                  |
| R5  | Conflict handling: supports `SKIP` strategy (default) and `FAIL` strategy for overlapping target slots     | Pending | `SlotsService.repeatWeekly`, conflict resolution logic          |
| R6  | Empty source validation: rejects repetition with 422 if the source week has no time slots configured       | Pending | `SlotsService.repeatWeekly`, `UnprocessableEntityException`     |
| R7  | Input bounds validation: rejects non-existent dates, non-positive or excessive week counts with 400        | Pending | `repeatWeeklyScheduleSchema`, `ZodValidationPipe`               |
| R8  | Atomic transaction: bulk slot and table duplication executes atomically within `prisma.$transaction`       | Pending | `SlotsService.repeatWeekly`, `PrismaService`                    |
| R9  | Web UI controls: staff page `/staff/slots` provides modal/form to trigger and confirm schedule repeat      | Pending | `RepeatScheduleDialog`, `/staff/slots` page                     |

### Decisions

- **HTTP Method:** `POST /api/slots/repeat-weekly` handles the bulk generation.
- **Conflict Resolution:** A `conflictStrategy` field (`'SKIP' | 'FAIL'`, defaulting to `'SKIP'`) provides flexibility between graceful coexistence and strict non-overlapping validation.
- **Day-of-Week Preservation:** Dates are computed using strict day offsets ($+7, +14, \dots$) in the hut timezone (`Europe/Rome`).
- **Independent Capacity:** Replicated slots have no booking links to their source; bookings made on a replicated slot do not impact the source or other weeks.
- **Language:** All API error messages, schedule notifications, and UI labels are in English.

## How it works

1. **Request Reception:** `POST /api/slots/repeat-weekly` receives `sourceStartDate`, `repeatWeeks`, and optional `conflictStrategy` with session cookie.
2. **Authentication & RBAC:** `AuthGuard` verifies session cookie; `RolesGuard` verifies caller role is `EMPLOYEE` or `WARDEN` (hikers receive `403 Forbidden`).
3. **Validation:** `ZodValidationPipe` validates date format, range bounds ($1 \dots 12$), and strategy enum.
4. **Source Retrieval:**
   - Queries all existing slots and tables between `sourceStartDate` and `sourceStartDate + 6 days`.
   - If 0 slots are found, throws `422 Unprocessable Entity` ("Source week contains no time slots to repeat").
5. **Target Generation & Conflict Check:**
   - For each week $k \in [1, \text{repeatWeeks}]$ and each source slot:
     - Target date is calculated as $\text{sourceSlot.date} + 7k$ days.
     - Checks for pre-existing slots at target `(date, startTime, endTime)`.
     - If conflict found and strategy is `FAIL`, aborts with `409 Conflict`.
     - If conflict found and strategy is `SKIP`, records slot as skipped.
     - If non-conflicting, prepares slot and table records for insertion.
6. **Persistence:**
   - Within `prisma.$transaction`, creates new slots and their `slot_tables`.
7. **Response:** Returns `201 Created` with counts of created and skipped slots, plus the list of created slot details.

## API

### `POST /api/slots/repeat-weekly`

Protected endpoint, requires session cookie of an authenticated `EMPLOYEE` or `WARDEN`.

| Field              | Type    | Rules                                                                |
| ------------------ | ------- | -------------------------------------------------------------------- |
| `sourceStartDate`  | string  | `YYYY-MM-DD`, valid calendar date (start of the 7-day source period) |
| `repeatWeeks`      | integer | Positive integer, minimum 1, maximum 12                              |
| `conflictStrategy` | string  | Optional: `"SKIP"` (default) or `"FAIL"`                             |

#### Example Request: Repeat schedule for 2 weeks

```bash
curl -X POST -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/slots/repeat-weekly \
  -d '{
    "sourceStartDate": "2035-06-04",
    "repeatWeeks": 2,
    "conflictStrategy": "SKIP"
  }'
```

Response `201 Created`:

```json
{
  "createdSlotsCount": 6,
  "skippedSlotsCount": 0,
  "targetWeeks": 2,
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

| Status | When                                                            | `message`                                           |
| ------ | --------------------------------------------------------------- | --------------------------------------------------- |
| `400`  | Invalid body schema (malformed date, repeatWeeks <= 0 or > 12)  | `Invalid data`                                      |
| `401`  | Missing or expired session cookie                               | `Unauthorized`                                      |
| `403`  | Authenticated user is a `HIKER`                                 | `This page is for the hut staff.`                   |
| `409`  | Overlapping target slot exists and `conflictStrategy` is `FAIL` | `A slot with the same date and time already exists` |
| `422`  | Source week contains no slots to copy                           | `Source week contains no time slots to repeat`      |

## Web app

- **Route:** `/staff/slots`
- **Component:** `RepeatWeeklyScheduleDialog` / action button in `SlotSchedule` toolbar.
- **Controls:**
  - Date input displaying the selected source week.
  - Number input for `repeatWeeks` (default: 1, range: 1–12).
  - Optional conflict strategy radio selector (Skip existing vs Fail on conflict).
  - "Confirm and repeat schedule" action button.
- **Feedback:**
  - Success banner: `Schedule successfully repeated across X weeks: Y slots created.`
  - Navigation: day picker updates allow staff to immediately view the replicated schedules on subsequent weeks.

## Code map

| Path                                             | Content                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| `docs/stories/MH-09-repeat-a-weekly-schedule.md` | Living User Story documentation                                   |
| `e2e/tests/api/repeat-weekly-schedule.spec.ts`   | Black-box API E2E tests: RBAC, multi-week replication, conflicts  |
| `e2e/tests/web/repeat-weekly-schedule.spec.ts`   | Black-box Web E2E tests: employee workflow, modal, validation, UI |

## Testing

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

| Spec                                           | Covers                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/tests/api/repeat-weekly-schedule.spec.ts` | Black-box API: RBAC (401, 403, 201), multi-day replication, exact table layouts, conflict handling (`SKIP`/`FAIL`), empty source week (422), input validation (400) |
| `e2e/tests/web/repeat-weekly-schedule.spec.ts` | Black-box Web: staff login, modal interaction, day navigation, schedule replication verification, validation feedback                                               |

### Test Coverage Roadmap & Pending Tests

- **TODO(MH-09):**
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
