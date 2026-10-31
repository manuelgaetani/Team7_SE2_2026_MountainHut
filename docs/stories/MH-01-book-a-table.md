# MH-01 — Book a table

|                |                                                                                   |
| -------------- | --------------------------------------------------------------------------------- |
| **Status**     | Backend partly implemented; one booking per slot, web UI and slot listing missing |
| **Depends on** | Authentication (MH-58), hiker profile (`User`/`Hiker` split)                      |

## User story

As a hiker, I want to book an available table for a selected date, time, and party size, so that my party has a place reserved for the meal.

A reservation is a number of seats at the same table. If the party does not fit at a single table, it can be spread over more than one.

Sharing a table with other parties is the standard rule. A hiker cannot ask for a private table.

## Requirements

Mandatory input: date, time, and number of people.

| #   | Requirement                                                                   | Status  | Implemented in                                   |
| --- | ----------------------------------------------------------------------------- | ------- | ------------------------------------------------ |
| R1  | Date and time are chosen from the available combinations                      | Partial | `slotId` must exist; no endpoint lists the slots |
| R2  | The party must fit in the seats available for that date and time              | Done    | `allocateSeats` (see [note](#open-points))       |
| R3  | Booking is possible up to 2 hours before the start time                       | Done    | `isBookableInTime`                               |
| R4  | Keep the party together as far as possible                                    | Done    | `allocateSeats`                                  |
| R5  | Use the smallest set of available seats and tables                            | Partial | `allocateSeats` (see [note](#open-points))       |
| R6  | Seat the party at one table, sharing it with other parties if needed          | Done    | `allocateSeats`                                  |
| R7  | Split the party only if no single table fits, using as few tables as possible | Done    | `allocateSeats`                                  |
| R8  | No private table option                                                       | Done    | The request has no such field                    |
| R9  | A hiker has only one booking per time slot on a date                          | Missing | Not enforced by the API or the database          |

## How it works

The hiker is taken from the session cookie, never from the request body. The whole booking runs in one database transaction:

1. Find the hiker profile of the logged-in user.
2. Lock the slot row with `SELECT ... FOR UPDATE`, and read its start time in `BOOKING_TIMEZONE`.
3. Read the free seats of each table. Only `CONFIRMED` bookings occupy seats.
4. Apply the booking policy: first the 2-hour rule, then the seat allocation.
5. Save the booking as `CONFIRMED`, together with its table assignments.

The row lock makes concurrent bookings for the same slot wait for each other, so two requests cannot take the same seats. Bookings for different slots do not block each other.

### Table assignment

1. Ignore the tables with no free seats. If the remaining seats are not enough, reject the booking.
2. If one table can hold the whole party, use the one with the fewest free seats that fits. On a tie, use the lowest table number.
3. Otherwise, fill the tables from the most free seats to the fewest until the party is seated. On a tie, use the lowest table number.

Free seats decide the choice, so a table already used by another party can be assigned to a new one.

Example with tables 1, 2 and 3 of 2, 4 and 6 seats, all in the same slot:

| Party size | Result                             | Free seats after (tables 1, 2, 3) |
| ---------- | ---------------------------------- | --------------------------------- |
| 3          | Table 2: 3 seats                   | 2, 1, 6                           |
| 5          | Table 3: 5 seats                   | 2, 1, 1                           |
| 4          | Table 1: 2, table 2: 1, table 3: 1 | 0, 0, 0                           |
| 1          | Rejected with `409`                | 0, 0, 0                           |

## API

### `POST /api/bookings`

Requires the session cookie set by `POST /api/auth/login`. The endpoint is also listed in Swagger at `/api/docs`.

| Field       | Type    | Rules                                     |
| ----------- | ------- | ----------------------------------------- |
| `slotId`    | integer | Positive, at most 2147483647              |
| `partySize` | integer | Positive, at most 100 (provisional limit) |

Unknown fields are ignored.

```bash
curl -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/bookings \
  -d '{"slotId":1,"partySize":3}'
```

Response `201 Created`:

```json
{
  "id": 1,
  "slotId": 1,
  "partySize": 3,
  "status": "CONFIRMED",
  "tables": [{ "tableNumber": 2, "assignedSeats": 3 }]
}
```

### Errors

| Status | When                                 | `message`                                            |
| ------ | ------------------------------------ | ---------------------------------------------------- |
| `400`  | The body is not valid                | `Dati non validi` (details in `issues`)              |
| `401`  | There is no valid session            | `Non autenticato`                                    |
| `403`  | The user has no hiker profile        | `A hiker profile is required to book a table`        |
| `404`  | The slot does not exist              | `Slot not found`                                     |
| `409`  | There are not enough free seats      | `Insufficient seats available for this slot`         |
| `422`  | The slot starts in less than 2 hours | `Less than 2 hours remaining before the slot starts` |

## Data model

| Table            | Purpose                                     |
| ---------------- | ------------------------------------------- |
| `slots`          | A date with a start and end time            |
| `slot_tables`    | The tables of a slot and their seats        |
| `bookings`       | Hiker, slot, party size and status          |
| `booking_tables` | How many seats of each table a booking uses |

`booking_tables` has a composite foreign key on `(booking_id, slot_id)`, so a table assignment always belongs to the same slot as its booking.

`bookings.status` can be `CONFIRMED`, `PENDING` or `REJECTED`. This story only creates `CONFIRMED` bookings.

## Configuration

| Variable           | Default       | Purpose                                            |
| ------------------ | ------------- | -------------------------------------------------- |
| `BOOKING_TIMEZONE` | `Europe/Rome` | Time zone in which the slot date and time are read |

`docker-compose.yml` does not pass this variable to the `app` container, so under Docker the default always applies.

## Code map

| Path                                           | Content                                |
| ---------------------------------------------- | -------------------------------------- |
| `packages/shared/src/bookings.ts`              | Request schema and response type       |
| `apps/api/src/bookings/bookings.controller.ts` | HTTP endpoint                          |
| `apps/api/src/bookings/bookings.service.ts`    | Transaction and mapping to HTTP errors |
| `apps/api/src/bookings/booking-policy.ts`      | 2-hour rule and booking decision       |
| `apps/api/src/bookings/seat-allocation.ts`     | Table assignment                       |
| `apps/api/src/bookings/bookings.repository.ts` | Database queries                       |
| `apps/api/prisma/schema.prisma`                | Data model                             |

## Testing

Run the unit tests:

```bash
npm run test -w @mountain-hut/shared
npm run test -w @mountain-hut/api
```

| Spec                                                | Covers                                 |
| --------------------------------------------------- | -------------------------------------- |
| `packages/shared/src/bookings.spec.ts`              | Request validation limits              |
| `apps/api/src/bookings/seat-allocation.spec.ts`     | Table assignment                       |
| `apps/api/src/bookings/booking-policy.spec.ts`      | 2-hour rule and booking decision       |
| `apps/api/src/bookings/bookings.service.spec.ts`    | Transaction flow and error mapping     |
| `apps/api/src/bookings/bookings.repository.spec.ts` | Database queries, with a mocked client |
| `apps/api/src/bookings/bookings.controller.spec.ts` | Endpoint behavior                      |

The Playwright suite has no booking tests yet. The unit tests do not exercise real concurrent bookings against PostgreSQL.

### Try it manually

No endpoint or seed creates slots yet, so insert one directly. Run this against a local database only:

```bash
docker compose exec -T db psql -U mountainhut -d mountainhut <<'SQL'
INSERT INTO slots (date, start_time, end_time)
VALUES ('2030-01-15', '19:00', '21:00');
INSERT INTO slot_tables (slot_id, table_number, seats)
SELECT id, n, n * 2 FROM slots, generate_series(1, 3) AS n
WHERE date = '2030-01-15';
SQL
```

Then register and log in to save the session cookie:

```bash
curl -H 'Content-Type: application/json' http://localhost:3000/api/auth/register \
  -d '{"email":"hiker@example.test","password":"Password123","fullName":"Test Hiker","phone":"+39 333 1234567"}'

curl -c cookies.txt -H 'Content-Type: application/json' http://localhost:3000/api/auth/login \
  -d '{"email":"hiker@example.test","password":"Password123"}'
```

Finally, send the booking request shown in the [API section](#post-apibookings), using the `id` of the new slot as `slotId`.

## Open points

**Missing for the story to be complete:**

- The rule of one booking per time slot on a date, for each hiker. Today the same hiker can book the same slot many times, and each request returns `201`. The rule needs a check in the booking transaction and a database constraint on hiker and slot. Its error response must also be defined.
- The choice of the last table when a party is split. The remaining people go to the table with the next most free seats, not to the smallest table that fits them. With 6, 5 and 2 free seats and a party of 7, the API uses 6 + 1 at the table with 5 free seats. The story asks for the smallest available set of seats, which would be 6 + 1 at the table with 2 free seats.
- A way for the hiker to see the available slots. `GET /api/slots` does not exist.
- A booking page in the web app. The web app currently has only the home page and the "not found" page.
- A way to create slots and tables, which is expected from MH-02.
- Playwright tests for the booking flow.

**To confirm with the product owner:**

- **Exact fit.** The story says the party must be "smaller than" the available seats. The API also accepts a party equal to the available seats, because a slot could otherwise never be filled.
- **Party size limit.** The limit of 100 is a provisional check that is not part of the story. The real limit is the free seats in the slot.
- **Exact 2-hour limit.** A slot that starts exactly 2 hours from now can still be booked.

**Other limits:**

- No endpoint can read or cancel a booking.
- A booking cannot be modified. A hiker who needs more seats must modify the reservation, which is covered by MH-06.
- Allergies and dietary needs cannot be recorded with a booking.
- `400` and `401` messages are in Italian, while the other booking errors are in English.
