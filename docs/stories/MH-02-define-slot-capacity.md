# MH-02 — Define slot capacity

|                |                                                                                  |
| -------------- | -------------------------------------------------------------------------------- |
| **Status**     | API complete; the staff web pages are not built yet                              |
| **Depends on** | Authentication (MH-58) and the role check (`RolesGuard`); used by MH-01 bookings |

## User story

As an employee, I want to define the set of tables and seats available for each time slot, so that the hut does not accept more customers than it can serve.

Slots are completely flexible in start time and duration, and a meal service on a given day can have more than one slot (e.g. 12–13 and 13–14). There is no fixed set of tables: lunch and dinner, or sunny and rainy days, can have different tables and seats. A table list can be reused from a previous slot instead of being entered again.

## Requirements

| #   | Requirement                                                                | Status | Implemented in                                     |
| --- | -------------------------------------------------------------------------- | ------ | -------------------------------------------------- |
| R1  | Only staff (employee or warden) define slots and tables                    | Done   | `@Roles('EMPLOYEE', 'WARDEN')`, `RolesGuard`       |
| R2  | A slot has a date and any start and end time, with the end after the start | Done   | `createSlotSchema`, check `slots_time_range_check` |
| R3  | A day can have several slots                                               | Done   | Only an identical date, start and end is refused   |
| R4  | Each table of a slot has its own number of seats (issue #11)               | Done   | `slot_tables`                                      |
| R5  | A table list can be copied from another slot                               | Done   | `copyTablesFromSlotId`                             |
| R6  | Every slot has its own tables: there is no fixed table set                 | Done   | A copy is independent of its source                |
| R7  | A slot without tables has 0 seats and cannot be booked (issue #17)         | Done   | `totalSeats: 0`; MH-01 lists it as `FULL`          |
| R8  | Changing a table set that is already defined belongs to MH-19 (issue #17)  | Done   | `PUT /api/slots/:id/tables` answers `409`          |

### Decisions

- A slot can be created with or without tables. Tables can be added later, once, with `PUT /api/slots/:id/tables`.
- Tables are given either as a list or as a copy of another slot, not both.
- Copying from a slot that has no tables is refused with `422`: there would be nothing to copy.
- Table numbers must be unique within a slot. Table numbers and seats are positive integers.
- Dates are `YYYY-MM-DD` and times `HH:MM`, local to the hut, as in MH-01.
- A slot cannot cross midnight, because the end must be after the start.
- The warden can do everything an employee can (context document).
- The staff list of a day is `GET /api/slots/schedule`, because `GET /api/slots` is the hikers' list of MH-01.
- The API and its messages are in English.

## How it works

Every endpoint first checks the session cookie (`AuthGuard`), then the role (`RolesGuard`): a hiker gets `403`.

- **Create a slot.** In one transaction, the API resolves the tables (the given list, or the tables of the source slot), creates the slot and then its tables. A slot with the same date, start and end is refused by the unique constraint and answered with `409`.
- **Define the tables of a slot.** In one transaction, the API locks the slot row with `SELECT ... FOR UPDATE`, checks that the slot has no tables yet, and creates them. The lock stops two requests from defining the tables of the same slot at the same time.
- **Read.** A slot is returned with its tables, ordered by table number, and with `totalSeats`.

Ids that cannot exist in the database (zero, negative, or above 2147483647) are answered with `404`.

The seats defined here are the ones MH-01 books: a slot created with tables appears in `GET /api/slots` with all its seats free, and each booking reduces them.

### Role check

`@Roles(...)` on a controller or on a method lists the roles allowed to call it. `RolesGuard` reads the role from the session token, so it must run after `AuthGuard`. A role on a method overrides the one on the controller. Other stories can use it, for example:

```ts
@UseGuards(AuthGuard, RolesGuard)
@Roles('WARDEN')
```

## API

All endpoints require the session cookie of an `EMPLOYEE` or `WARDEN` user. They are listed in Swagger at `/api/docs`, under `slots`.

### `POST /api/slots`

| Field                  | Type    | Rules                                                           |
| ---------------------- | ------- | --------------------------------------------------------------- |
| `date`                 | string  | `YYYY-MM-DD`, a real calendar date                              |
| `startTime`            | string  | `HH:MM`                                                         |
| `endTime`              | string  | `HH:MM`, after `startTime`                                      |
| `tables`               | array   | Optional; at least one `{ tableNumber, seats }`, unique numbers |
| `copyTablesFromSlotId` | integer | Optional; the slot whose tables are copied. Not with `tables`   |

```bash
curl -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/slots \
  -d '{"date":"2030-01-15","startTime":"19:00","endTime":"21:00","tables":[{"tableNumber":1,"seats":4},{"tableNumber":2,"seats":6}]}'
```

Response `201 Created`:

```json
{
  "id": 1,
  "date": "2030-01-15",
  "startTime": "19:00",
  "endTime": "21:00",
  "tables": [
    { "tableNumber": 1, "seats": 4 },
    { "tableNumber": 2, "seats": 6 }
  ],
  "totalSeats": 10
}
```

To reuse the tables of slot 1 for another slot:

```json
{ "date": "2030-01-15", "startTime": "21:00", "endTime": "22:00", "copyTablesFromSlotId": 1 }
```

### `PUT /api/slots/:id/tables`

Defines the tables of a slot that has none, with exactly one of `tables` or `copyTablesFromSlotId`. Answers `200` with the slot, in the same format.

### `GET /api/slots/schedule?date=YYYY-MM-DD`

The slots of one day, ordered by start time, each with its tables and `totalSeats`.

### `GET /api/slots/:id`

One slot with its tables.

### Errors

| Status | When                                               | `message`                                                 |
| ------ | -------------------------------------------------- | --------------------------------------------------------- |
| `400`  | The body or the `date` query is not valid          | `Invalid data` (details in `issues`)                      |
| `400`  | The id in the path is not a number                 | `Validation failed (numeric string is expected)`          |
| `401`  | There is no valid session                          | `Not authenticated`                                       |
| `403`  | The user is not an employee or a warden            | `Operation not allowed for your role`                     |
| `404`  | The slot does not exist                            | `Slot not found`                                          |
| `404`  | The slot to copy from does not exist               | `The slot to copy the tables from does not exist`         |
| `409`  | A slot with the same date, start and end exists    | `A slot with the same date, start and end already exists` |
| `409`  | `PUT .../tables` on a slot that already has tables | `This slot already has tables: changing them is MH-19`    |
| `422`  | The slot to copy from has no tables                | `The slot to copy the tables from has no tables`          |

## Web app

Not built yet. The staff pages to create slots, enter or copy their tables, and see the schedule of a day are the next tasks of this story.

## Data model

No new tables: MH-02 writes the tables defined for MH-01.

| Table         | Purpose                              |
| ------------- | ------------------------------------ |
| `slots`       | A date with a start and end time     |
| `slot_tables` | The tables of a slot and their seats |

The database refuses a slot whose end is not after its start (`slots_time_range_check`), a table without seats (`slot_tables_seats_check`), and two slots with the same date, start and end.

## Code map

| Path                                     | Content                                       |
| ---------------------------------------- | --------------------------------------------- |
| `packages/shared/src/slots.ts`           | Request schemas and response types            |
| `apps/api/src/slots/slots.controller.ts` | The four endpoints                            |
| `apps/api/src/slots/slots.service.ts`    | Transactions, copy and mapping to HTTP errors |
| `apps/api/src/slots/slots.repository.ts` | Database queries and the slot lock            |
| `apps/api/src/auth/roles.decorator.ts`   | `@Roles(...)`                                 |
| `apps/api/src/auth/roles.guard.ts`       | Role check                                    |

## Testing

Run the end-to-end tests with Docker running. Rebuild the stack first, so that it runs the current code:

```bash
docker compose up --build -d --wait
npm run test:e2e
```

| Spec                                    | Covers                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/auth/roles.guard.spec.ts` | Role check: allowed and forbidden roles, method roles overriding controller roles                                                                    |
| `e2e/tests/api/slots.spec.ts`           | Access by role, tables and total seats, flexible times, several slots a day, different tables per slot, copying, MH-19 boundary, validation, Swagger |

The end-to-end tests get staff sessions through the `employeeRequest` and `wardenRequest` fixtures, which register a user and set its role with `setUserRole` in the database of the `docker compose` stack.

The unit and integration tests of the slot service are not written yet.

### Try it manually

Staff accounts cannot be created through the API yet, so promote a registered user, in a local database only:

```bash
docker compose exec -T db psql -U mountainhut -d mountainhut \
  -c "UPDATE users SET role = 'EMPLOYEE' WHERE email = 'you@example.com';"
```

Sign in again, so that the new role is in the session, then use Swagger at <http://localhost:3000/api/docs>: create a slot, copy its tables to a second slot, and read the schedule of the day. A hiker can then book the new slot from **Book a table** (MH-01).

## Open points

- **Overlapping slots and slots in the past** are accepted. The story does not say whether they should be refused; the team is deciding whether to ask the product owner (`TODO(MH-02)` in `SlotsService.create`).
- **Staff accounts.** No endpoint creates employees or wardens; the role is set in the database.
- **Changing a slot** (its time or its tables) after it is defined is MH-19.
