# MH-01 — Book a table

|                |                                                              |
| -------------- | ------------------------------------------------------------ |
| **Status**     | Complete, except that slots are created by hand until MH-02  |
| **Depends on** | Authentication (MH-58), hiker profile (`User`/`Hiker` split) |

## User story

As a hiker, I want to book an available table for a selected date, time, and party size, so that my party has a place reserved for the meal.

A reservation is a number of seats at the same table. If the party does not fit at a single table, it can be spread over more than one.

Sharing a table with other parties is the standard rule. A hiker cannot ask for a private table.

## Requirements

Mandatory input: date, time, and number of people.

| #   | Requirement                                                                   | Status | Implemented in                           |
| --- | ----------------------------------------------------------------------------- | ------ | ---------------------------------------- |
| R1  | Date and time are chosen from the available combinations                      | Done   | `GET /api/slots`, booking page           |
| R2  | The party must fit in the seats available for that date and time              | Done   | `allocateSeats`                          |
| R3  | Booking is possible up to 2 hours before the start time                       | Done   | `isBookableInTime`                       |
| R4  | Keep the party together as far as possible                                    | Done   | `allocateSeats`                          |
| R5  | Use the smallest set of available seats and tables                            | Done   | `allocateSeats`                          |
| R6  | Seat the party at one table, sharing it with other parties if needed          | Done   | `allocateSeats`                          |
| R7  | Split the party only if no single table fits, using as few tables as possible | Done   | `allocateSeats`                          |
| R8  | No private table option                                                       | Done   | The request has no such field            |
| R9  | A hiker has only one booking per time slot on a date                          | Done   | `hasActiveBooking`, partial unique index |

### Decisions

- A party equal to the free seats is accepted, so a slot can fill up completely. The story says "smaller than".
- When a party is split, the last people go to the smallest table that fits them.
- The hiker sees all future slots. Full slots and slots starting in less than 2 hours are shown but cannot be chosen.
- A second booking for the same slot is rejected with `409`. Only `REJECTED` bookings allow the hiker to try again.
- There is no upper limit on the party size other than the free seats.
- The booking page and all the API messages are in English.
- There is no seed: slots are created by hand until MH-02.

## How it works

The hiker is taken from the session cookie, never from the request body. The whole booking runs in one database transaction:

1. Find the hiker profile of the logged-in user.
2. Lock the slot row with `SELECT ... FOR UPDATE`, and read its start time in `BOOKING_TIMEZONE`.
3. Reject the request if the hiker already has a booking for this slot.
4. Read the free seats of each table. Only `CONFIRMED` bookings occupy seats.
5. Apply the booking policy: first the 2-hour rule, then the seat allocation.
6. Save the booking as `CONFIRMED`, together with its table assignments.

The row lock makes concurrent bookings for the same slot wait for each other, so two requests cannot take the same seats, and one hiker cannot book twice with two simultaneous requests. Bookings for different slots do not block each other.

### Table assignment

1. Ignore the tables with no free seats. If the remaining seats are not enough, reject the booking.
2. If one table can hold the whole party, use the one with the fewest free seats that fits. On a tie, use the lowest table number.
3. Otherwise, fill the tables from the most free seats to the fewest, which uses as few tables as possible. As soon as one table can hold the people left, seat them at the smallest such table. On a tie, use the lowest table number.

Free seats decide the choice, so a table already used by another party can be assigned to a new one.

Example with tables 1, 2 and 3 of 2, 4 and 6 seats, all in the same slot:

| Party size | Result                             | Free seats after (tables 1, 2, 3) |
| ---------- | ---------------------------------- | --------------------------------- |
| 3          | Table 2: 3 seats                   | 2, 1, 6                           |
| 5          | Table 3: 5 seats                   | 2, 1, 1                           |
| 4          | Table 1: 2, table 2: 1, table 3: 1 | 0, 0, 0                           |
| 1          | Rejected with `409`                | 0, 0, 0                           |

With free seats 6, 5 and 2 and a party of 7, the API seats 6 people at the first table and 1 at the table with 2 free seats. The table with 5 free seats stays available.

## API

Both endpoints require the session cookie set by `POST /api/auth/login`. They are also listed in Swagger at `/api/docs`.

### `GET /api/slots`

Returns the slots that have not started yet, in chronological order. Times are local to the hut.

```json
[
  {
    "id": 1,
    "date": "2030-01-15",
    "startTime": "19:00",
    "endTime": "21:00",
    "freeSeats": 12,
    "availability": "AVAILABLE"
  }
]
```

| `availability` | Meaning                              |
| -------------- | ------------------------------------ |
| `AVAILABLE`    | The slot can be booked               |
| `FULL`         | There are no free seats              |
| `TOO_LATE`     | The slot starts in less than 2 hours |

### `POST /api/bookings`

| Field       | Type    | Rules                                            |
| ----------- | ------- | ------------------------------------------------ |
| `slotId`    | integer | Positive, at most 2147483647                     |
| `partySize` | integer | Positive; must fit in the free seats of the slot |

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

| Status | When                                         | `message`                                            |
| ------ | -------------------------------------------- | ---------------------------------------------------- |
| `400`  | The body is not valid                        | `Invalid data` (details in `issues`)                 |
| `401`  | There is no valid session                    | `Not authenticated`                                  |
| `403`  | The user has no hiker profile                | `A hiker profile is required to book a table`        |
| `404`  | The slot does not exist                      | `Slot not found`                                     |
| `409`  | There are not enough free seats              | `Insufficient seats available for this slot`         |
| `409`  | The hiker already has a booking for the slot | `You already have a booking for this slot`           |
| `422`  | The slot starts in less than 2 hours         | `Less than 2 hours remaining before the slot starts` |

`GET /api/slots` can only return `401`.

## Web app

The page `/book` is linked from the navigation bar. A visitor without a session sees a link to sign in.

The hiker chooses a date, then a time, and enters the number of people. Each time shows the seats left, and times that cannot be booked are disabled. After booking, the page shows the assigned tables and reloads the free seats. If the API refuses the booking, the page shows its message.

## Data model

| Table            | Purpose                                     |
| ---------------- | ------------------------------------------- |
| `slots`          | A date with a start and end time            |
| `slot_tables`    | The tables of a slot and their seats        |
| `bookings`       | Hiker, slot, party size and status          |
| `booking_tables` | How many seats of each table a booking uses |

The partial unique index `bookings_hiker_id_slot_id_active_key` allows one non-rejected booking for each hiker and slot. Prisma cannot express it, so it exists only in the `one_booking_per_slot` migration. The migration fails if a database already contains duplicate bookings.

`booking_tables` has a composite foreign key on `(booking_id, slot_id)`, so a table assignment always belongs to the same slot as its booking.

`bookings.status` can be `CONFIRMED`, `PENDING` or `REJECTED`. This story only creates `CONFIRMED` bookings.

## Configuration

| Variable           | Default       | Purpose                                            |
| ------------------ | ------------- | -------------------------------------------------- |
| `BOOKING_TIMEZONE` | `Europe/Rome` | Time zone in which the slot date and time are read |

`docker-compose.yml` passes this variable to the `app` container.

## Code map

| Path                                           | Content                                |
| ---------------------------------------------- | -------------------------------------- |
| `packages/shared/src/bookings.ts`              | Request schema and response type       |
| `apps/api/src/bookings/bookings.controller.ts` | Booking endpoint                       |
| `apps/api/src/bookings/slots.controller.ts`    | Slot list endpoint                     |
| `apps/api/src/bookings/bookings.service.ts`    | Transaction and mapping to HTTP errors |
| `apps/api/src/bookings/booking-policy.ts`      | 2-hour rule and booking decision       |
| `apps/api/src/bookings/seat-allocation.ts`     | Table assignment                       |
| `apps/api/src/bookings/bookings.repository.ts` | Database queries                       |
| `apps/api/prisma/schema.prisma`                | Data model                             |
| `apps/web/src/pages/BookingPage.tsx`           | Booking page                           |
| `apps/web/src/api/bookings.ts`                 | Web client for the two endpoints       |

## Testing

Run the unit tests:

```bash
npm run test -w @mountain-hut/shared
npm run test -w @mountain-hut/api
npm run test -w @mountain-hut/web
```

Run the end-to-end tests with Docker running. Rebuild the stack first, so that it runs the current code:

```bash
docker compose up --build -d --wait
npm run test:e2e
```

| Spec                                                | Covers                                                     |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `packages/shared/src/bookings.spec.ts`              | Request validation limits                                  |
| `apps/api/src/bookings/seat-allocation.spec.ts`     | Table assignment                                           |
| `apps/api/src/bookings/booking-policy.spec.ts`      | 2-hour rule, availability and booking decision             |
| `apps/api/src/bookings/bookings.service.spec.ts`    | Transaction flow, slot list and error mapping              |
| `apps/api/src/bookings/bookings.repository.spec.ts` | Database queries, with a mocked client                     |
| `apps/api/src/bookings/bookings.controller.spec.ts` | Booking endpoint                                           |
| `apps/api/src/bookings/slots.controller.spec.ts`    | Slot list endpoint                                         |
| `apps/web/src/pages/BookingPage.test.tsx`           | Booking page                                               |
| `e2e/tests/api/bookings.spec.ts`                    | API rules on the real stack, including concurrent bookings |
| `e2e/tests/web/booking.spec.ts`                     | Sign-in and booking in a real browser                      |

The end-to-end tests create their slots directly in the database of the `docker compose` stack and delete them afterwards.

### Try it manually

No endpoint creates slots yet, so insert one directly. Run this against a local database only:

```bash
docker compose exec -T db psql -U mountainhut -d mountainhut <<'SQL'
INSERT INTO slots (date, start_time, end_time)
VALUES ('2030-01-15', '19:00', '21:00');
INSERT INTO slot_tables (slot_id, table_number, seats)
SELECT id, n, n * 2 FROM slots, generate_series(1, 3) AS n
WHERE date = '2030-01-15';
SQL
```

Then open <http://localhost:3000/register>, create an account, sign in, and choose **Book a table**.

## Open points

- **Slot creation.** Slots and tables can only be inserted by hand until MH-02.
- **Modifying a booking.** A hiker who needs more seats must modify the reservation, which is covered by MH-06. No endpoint can read, modify or cancel a booking yet.
