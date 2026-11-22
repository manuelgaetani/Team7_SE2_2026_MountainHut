# MH-09 — Repeat a weekly schedule

|                |                                                                                  |
| -------------- | -------------------------------------------------------------------------------- |
| **Status**     | Done: API and web dialog complete and tested                                     |
| **Depends on** | MH-02 (define slot capacity and tables), MH-58 (authentication and `RolesGuard`) |

## User story

**Business value:** 945

As an employee,  
I want to copy or repeat a schedule across multiple weeks,  
so that I do not have to configure recurring slots individually.

### Clarifications

- Is should be possible to replicate the schedule for all the days of a given week into another week instead of having to enter all the slots manually one by one. (they can later be adjusted if required, see MH-19
- Not: it is not possible to copy a weekly schedule onto an existing schedule unless there are not reservations, in this case it completely replaces the existing one.

Team assumptions:

- _Adjusting the copies:_ "they can later be adjusted if required" refers to MH-19 (modify a slot), not to this story (course issue #45).
- _Warden:_ the warden can do everything an employee can, so both `EMPLOYEE` and `WARDEN` can repeat a schedule.
- _Several weeks at once:_ the story says "across multiple weeks", so one request copies the source week into 1 to 12 following weeks.

## Requirements

| #   | Requirement                                                                                                   | Status | Implemented in                                                   |
| --- | ------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| R1  | Only the staff (`EMPLOYEE`, `WARDEN`) repeat a schedule                                                       | Done   | `SlotsController.repeatWeekly` (`@Roles('EMPLOYEE', 'WARDEN')`)  |
| R2  | The source week is the 7 days starting at the chosen date                                                     | Done   | `repeatWeeklyScheduleSchema`, `SlotsService.repeatWeekly`        |
| R3  | The source week is copied into 1 to 12 following weeks                                                        | Done   | `repeatWeeklyScheduleSchema` (`MAX_REPEAT_WEEKS`)                |
| R4  | Every slot is copied with its times and tables onto the same weekday of each target week                      | Done   | `projectWeeklySchedule`, `SlotsService.repeatWeekly`             |
| R5  | A target week with reservations (pending or confirmed bookings) cannot be replaced: `409`, nothing is written | Done   | `SlotsRepository.findReservedDates`, `SlotsService.repeatWeekly` |
| R6  | A target week without reservations is replaced completely: its slots are deleted, then the copies are created | Done   | `SlotsRepository.deleteSlots`, `SlotsService.repeatWeekly`       |
| R7  | An empty source week is refused with `422`                                                                    | Done   | `SlotsService.repeatWeekly`                                      |
| R8  | All or nothing: every check, deletion and copy runs in one transaction                                        | Done   | `SlotsService.repeatWeekly` (one unit of work)                   |
| R9  | Web app: the staff repeat the week of the chosen day from `/staff/slots`                                      | Done   | `RepeatWeeklyScheduleDialog`, `SlotsPage`                        |

### Decisions

- **Endpoint.** `POST /api/slots/repeat-weekly` with `sourceStartDate` and `repeatWeeks`.
- **No conflict strategy.** The first draft of this contract had a `conflictStrategy` (`SKIP` / `FAIL`). The product owner's answer to course issue #45 replaced it: a target week is either replaced completely or, if it has reservations, not touched. A `conflictStrategy` sent by a client is ignored.
- **What a reservation is.** A booking that takes seats: `PENDING` or `CONFIRMED`. Bookings that take no seats (`REJECTED`, and `CANCELLED` from MH-08) do not block the copy and are deleted with their slot, with their table assignments. Their email records stay, without the booking.
- **The target weeks are the 7-day periods after the source.** Week _k_ goes from `sourceStartDate + 7k` to `sourceStartDate + 7k + 6`. The source date does not have to be a Monday: the week of the copy starts on the chosen day.
- **All or nothing.** If one target week has reservations, no week is changed, and the answer names the first week with reservations.
- **Dates.** The copies are calendar dates moved by 7, 14, … days, computed at UTC midnight, so a change of daylight saving time never moves a slot to another day. The times stay the same.
- **Independent copies.** A copy is a new slot with its own tables: it has no link to its source, and its bookings do not change the seats of the source or of the other weeks.
- **Locks.** The copy locks every day of the target weeks (PostgreSQL advisory locks, in date order), so two copies onto the same days run one after the other and cannot deadlock. The key is the one of the MH-02 overlap check (`slots-day:YYYY-MM-DD`), so creating a slot also waits for a running copy. A booking locks only its slot row, so before looking for reservations the copy also locks the target slot rows (`SELECT ... FOR UPDATE`, in id order): a booking in progress either commits first, and the copy sees it (`409`), or waits and then finds its slot gone (`404`). A booking is never deleted without an answer.
- **Slots in the past.** The story does not forbid copying from or into past weeks, so it is allowed.
- **Language.** All API messages and UI labels are in English.

## How it works

1. `POST /api/slots/repeat-weekly` arrives with the session cookie. `AuthGuard` checks the session, `RolesGuard` the `EMPLOYEE` or `WARDEN` role, `ZodValidationPipe(repeatWeeklyScheduleSchema)` the body.
2. In one transaction, `SlotsService.repeatWeekly`:
   1. locks every day of the target weeks, in date order;
   2. reads the slots and tables from `sourceStartDate` to `sourceStartDate + 6` (`422` if there are none);
   3. locks the slot rows of the target weeks, so no booking can be added to them;
   4. looks for pending or confirmed bookings in the target weeks (`409` naming the first week that has them);
   5. deletes the slots of the target weeks, with their tables and their bookings that take no seats;
   6. creates each source slot again, with a copy of its tables, on the same weekday of each target week (`projectWeeklySchedule`).
3. The answer is `201` with the number of weeks, of created and of replaced slots, and the created slots ordered by date and start time.

## API

### `POST /api/slots/repeat-weekly`

Staff only (`EMPLOYEE`, `WARDEN`).

| Field             | Type    | Rules                                                            |
| ----------------- | ------- | ---------------------------------------------------------------- |
| `sourceStartDate` | string  | `YYYY-MM-DD`, valid calendar date (first day of the source week) |
| `repeatWeeks`     | integer | From 1 to 12                                                     |

```bash
curl -X POST -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/slots/repeat-weekly \
  -d '{"sourceStartDate":"2035-06-04","repeatWeeks":2}'
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
| `401`  | No valid session                                                         | `Not authenticated`                                                              |
| `403`  | The user is a hiker                                                      | `Operation not allowed for your role`                                            |
| `409`  | A slot of a target week has reservations                                 | `The week starting YYYY-MM-DD has reservations: its schedule cannot be replaced` |
| `422`  | The source week has no slots                                             | `Source week contains no time slots to repeat`                                   |

## Web app

- **Button.** `/staff/slots` has a **Repeat weekly schedule** button under the day picker. The source week starts on the day chosen on the page.
- **Dialog** (`RepeatWeeklyScheduleDialog`): the source week (e.g. _"4 Jun – 10 Jun"_), the field _Number of weeks to repeat_ (1 by default, 1 to 12) and, while the number is valid, the target period (_"Target: 11 Jun – 24 Jun"_). A warning says that the slots already in those weeks are replaced and that a week with reservations cannot be replaced. Below it, the dialog loads the days of the target period (`GET /api/slots/schedule`, one request per day, shared with the cache of the page) and says how many slots will be replaced (_"3 slots already in the target weeks will be replaced."_) or that there are none (_"The target weeks have no slots: nothing will be replaced."_). If a day cannot be loaded, only the general warning stays. **Confirm and repeat schedule** sends the request (_"Repeating…"_ while it runs); **Cancel**, the close button, `Escape` or a click outside close the dialog.
- **Validation.** `repeatWeeklyScheduleSchema.safeParse` before sending: _"Must be at least 1 week."_, _"At most 12 weeks."_, _"Enter a whole number of weeks."_; nothing is sent.
- **Outcome.** The dialog closes and the page shows _"Schedule successfully repeated across 2 weeks: 6 slots created."_, plus _"3 slots replaced."_ when target slots were replaced. Every cached day of the schedule is refreshed.
- **Errors.** The dialog stays open with the message of the API for `403`, `404`, `409` and `422` (e.g. the week with reservations), _"The session has expired. Please log in again."_ for `401`, otherwise _"Saving failed. Please try again."_.

## Data model

No change: the copies are normal rows of `slots` and `slot_tables`.

## Code map

| Path                                                           | Content                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `docs/stories/MH-09-repeat-a-weekly-schedule.md`               | This document                                                                         |
| `packages/shared/src/slots.ts`                                 | `repeatWeeklyScheduleSchema`, `MAX_REPEAT_WEEKS`, `RepeatWeeklyScheduleResult`        |
| `apps/api/src/slots/presentation/slots.controller.ts`          | `POST /api/slots/repeat-weekly`, staff only                                           |
| `apps/api/src/slots/application/slots.service.ts`              | `SlotsService.repeatWeekly`: locks, checks, replacement and copies in one transaction |
| `apps/api/src/slots/application/slots.repository.port.ts`      | `lockDay`, `lockBetween`, `findBetween`, `findReservedDates`, `deleteSlots`           |
| `apps/api/src/slots/infrastructure/prisma-slots.repository.ts` | Day and slot row locks, reserved days, deletion of slots with tables and bookings     |
| `apps/api/src/slots/domain/repeat-schedule-calculator.ts`      | `projectWeeklySchedule` and `addDays`: dates of the copies                            |
| `apps/web/src/components/RepeatWeeklyScheduleDialog.tsx`       | Dialog: source and target weeks, slots to replace, validation, errors                 |
| `apps/web/src/pages/SlotsPage.tsx`                             | **Repeat weekly schedule** button and outcome banner                                  |
| `apps/web/src/api/slots.ts`, `api/useSlots.ts`                 | `POST /api/slots/repeat-weekly`, its TanStack Query hook, `useSchedules` (many days)  |

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

| Spec                                                                | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/repeat-weekly-schedule.int-spec.ts`                  | Real PostgreSQL. Copies with the same weekday, times and tables, sorted answer and totals; exactly 7 source days; any weekday and the end of daylight saving time; slot without tables; 12 weeks; bookings not copied and copies with their own seats; complete replacement; empty source `422`; `PENDING`/`CONFIRMED` `409` with nothing written; first reserved week named; rejected booking deleted with its email record kept; two overlapping copies at the same time; a booking made during a copy is never lost silently |
| `e2e/tests/api/repeat-weekly-schedule.spec.ts`                      | Running stack. `401`, `403`, `201`; several days with exact tables; 7-day source from any weekday; 12 weeks; daylight saving time; independent copies; replacement of a week without reservations; `conflictStrategy` ignored; `REJECTED` does not block; `PENDING`/`CONFIRMED` `409` with nothing written; empty source `422`; `400`                                                                                                                                                                                           |
| `e2e/tests/web/repeat-weekly-schedule.spec.ts`                      | Running stack. Visitors and hikers cannot open the staff page; employee and warden repeat a week; validation, replacement warning and `409`; focus, `Escape`, button disabled while sending, outcome banner; source and target preview; closing copies nothing                                                                                                                                                                                                                                                                  |
| `apps/web/src/components/RepeatWeeklyScheduleDialog.test.tsx`       | Dialog with a mocked API: staff only, source and target weeks, number of slots to replace, validation without a request, `201` banner, `409`/`422`/`401` messages, closing                                                                                                                                                                                                                                                                                                                                                      |
| `packages/shared/src/repeat-weekly-schedule.spec.ts`                | Black box of the schema: `repeatWeeks` 1 to 12, date format and calendar validity, `conflictStrategy` ignored                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `apps/api/src/slots/domain/repeat-schedule-calculator.spec.ts`      | Black box of `projectWeeklySchedule`: same weekday in each week, tables copied, month, year and leap day changes                                                                                                                                                                                                                                                                                                                                                                                                                |
| `apps/api/src/slots/application/slots.service.spec.ts`              | `repeatWeekly` with a mocked repository: day locks in order, source and target ranges, copies with tables, replacement, `409` and `422` without writes                                                                                                                                                                                                                                                                                                                                                                          |
| `apps/api/src/slots/infrastructure/prisma-slots.repository.spec.ts` | White box: `lockDay` key, `findBetween`, `findReservedDates` filter, `deleteSlots` order                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `apps/api/src/slots/presentation/slots.controller.spec.ts`          | `POST /slots/repeat-weekly`: staff only, `400` on invalid bodies, `conflictStrategy` not passed on                                                                                                                                                                                                                                                                                                                                                                                                                              |

A copy replaces whole target weeks, so the MH-09 E2E tests use their own range of years (2200-2580) and never delete the slots of other suites.

### Try it manually

1. Start the stack with `docker compose up --build -d`.
2. Log in as an employee and keep the cookies: `curl -c cookies.txt -H 'Content-Type: application/json' http://localhost:3000/api/auth/login -d '{"email":"<employee email>","password":"<password>"}'`.
3. Create a few slots with tables in one week with `POST /api/slots` (or at http://localhost:3000/staff/slots).
4. Copy the week: `POST /api/slots/repeat-weekly` with the first day of that week and `"repeatWeeks": 2`. The answer is `201` with the created slots.
5. Check the next two weeks with `GET /api/slots/schedule?date=<day + 7>` and `<day + 14>`: the same slots and tables.
6. Log in as a hiker and book one of the copies, then repeat the copy again as the employee: `409`, and nothing changes.
7. In the web app: on `/staff/slots` choose a day, press **Repeat weekly schedule**, choose the number of weeks, check how many slots will be replaced and confirm.

## Open points

- **Time limit of the transaction.** The copy runs in one Prisma interactive transaction with the default time limit (5 s), and it writes one slot and its tables at a time. A full schedule over 12 weeks (e.g. 3 slots a day, 252 copies) or a long wait for a lock can go over the limit: the transaction is rolled back, nothing is written, and the staff get _"Saving failed"_. A fix: create the copies with `createManyAndReturn` and `slotTable.createMany`, and give this unit of work a longer `timeout`.
- **Extra ideas, outside the story.** Copying only some weekdays, closure dates and undoing a copy are not requirements.
