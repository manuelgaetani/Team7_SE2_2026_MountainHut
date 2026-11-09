# MH-04 — Check availability

|                |                                                             |
| -------------- | ----------------------------------------------------------- |
| **Status**     | E2E test suite defined (black-box); implementation pending  |
| **Depends on** | MH-01 (bookings & table layout), MH-02 (slot & table setup) |

## User story

**Business value:** 975

As a user,
I want to check table availability for a given date, time and party size,
so that I can decide whether to make a booking.

### Clarifications

- **The check is public:** no login or authentication session is required. Any anonymous visitor or registered user can perform the check.
- **Table layout breakdown:** Given date, time, and party size, the system answers based on the free seats and the table layout. For example, with 6 free seats split over 3 tables of 2, a party of 6 is available, and this detail must be made available to the user (e.g. `2 + 2 + 2 seats` or `2 + 3 + 1 seats`).
- **No alternative slots:** No alternative slots are suggested. If a slot is unavailable or not found, the user can just check a different slot manually.

## Requirements

| #   | Requirement                                                                     | Status  | Implemented in                               |
| --- | ------------------------------------------------------------------------------- | ------- | -------------------------------------------- |
| R1  | Public access: check is accessible without authentication (no session required) | Pending | `GET /api/availability`, `/availability`     |
| R2  | Input parameters: valid `date` (YYYY-MM-DD), `time` (HH:MM), and `partySize`    | Pending | `checkAvailabilitySchema`, availability form |
| R3  | Check evaluated against free seats and table layout for the requested slot      | Pending | `AvailabilityService.check`                  |
| R4  | Detailed breakdown of seats across tables when available (e.g. `2 + 3 + 1`)     | Pending | `AvailabilityService.check`, breakdown view  |
| R5  | Clear unavailable response when party size exceeds free seats                   | Pending | `AvailabilityService.check`, feedback alert  |
| R6  | Responds unavailable/not found when no slot exists for requested date and time  | Pending | `AvailabilityService.check`                  |
| R7  | No alternative time slots are suggested when requested slot is unavailable      | Pending | Availability response contract               |

### Decisions

- **Public endpoint.** Unlike `GET /api/slots` which is reserved for authenticated hikers planning a booking, `GET /api/availability` is public to allow casual visitors to explore availability before registering or logging in.
- **Seat breakdown format.** The response exposes both structured table assignments (`tables: [{ tableNumber, seats }]`) and a human-readable layout summary (`breakdown: [2, 3, 1]`, `breakdownText: "2 + 3 + 1 seats"`).
- **Strict scope.** The endpoint does not suggest alternative slots on the same or adjacent days, keeping response payloads lightweight and leaving slot exploration to the user.
- **Language.** All API messages and UI text are in English.

## How it works

1. The client sends a `GET /api/availability?date=YYYY-MM-DD&time=HH:MM&partySize=N` request (no credentials required).
2. The endpoint validates parameters with `ZodValidationPipe` (date format, time format, positive integer party size).
3. The service searches for an active future slot matching the date and start time.
4. If no matching slot is found or the slot has passed, it responds `available: false` with reason `NO_SLOT`.
5. If a slot exists, the service computes free seats for each table (subtracting seats occupied by `PENDING` and `CONFIRMED` bookings).
6. Using the seat allocation algorithm (from MH-01), the service determines whether the party fits and how it is distributed across tables.
7. If the party fits, the endpoint returns `200 OK` with `available: true` and the table seat breakdown. If it does not fit, it returns `available: false` with reason `INSUFFICIENT_SEATS`.

## API

### `GET /api/availability`

Public endpoint, no authentication cookies required.

| Query Parameter | Type    | Rules                             |
| --------------- | ------- | --------------------------------- |
| `date`          | string  | `YYYY-MM-DD`, valid calendar date |
| `time`          | string  | `HH:MM`, 24-hour time             |
| `partySize`     | integer | Positive integer (minimum 1)      |

#### Example Request: Available

```bash
curl "http://localhost:3000/api/availability?date=2035-06-15&time=12:00&partySize=6"
```

Response `200 OK`:

```json
{
  "available": true,
  "date": "2035-06-15",
  "time": "12:00",
  "partySize": 6,
  "totalFreeSeats": 10,
  "tables": [
    { "tableNumber": 1, "seats": 2 },
    { "tableNumber": 2, "seats": 3 },
    { "tableNumber": 3, "seats": 1 }
  ],
  "breakdown": [2, 3, 1],
  "breakdownText": "2 + 3 + 1 seats"
}
```

#### Example Request: Unavailable

```bash
curl "http://localhost:3000/api/availability?date=2035-06-15&time=12:00&partySize=12"
```

Response `200 OK`:

```json
{
  "available": false,
  "date": "2035-06-15",
  "time": "12:00",
  "partySize": 12,
  "totalFreeSeats": 10,
  "reason": "INSUFFICIENT_SEATS"
}
```

### Errors

| Status | When                                  | `message`                               |
| ------ | ------------------------------------- | --------------------------------------- |
| `400`  | Invalid date, time, or party size < 1 | `Validation failed: invalid input data` |

## Web app

- **Route:** `/availability` (Public page, accessible without login)
- **Components:**
  - Form with Date, Time, and Party Size inputs.
  - Submit button: _"Check availability"_.
  - Result Card:
    - Available: confirmation banner with seat breakdown detail (e.g. _"Table layout: 2 + 3 + 1 seats"_).
    - Unavailable: warning notice stating that the slot cannot accommodate the requested party size.
    - No alternative slots are displayed or suggested.

## Code map

| Path                                       | Content                                            |
| ------------------------------------------ | -------------------------------------------------- |
| `docs/stories/MH-04-check-availability.md` | Official User Story documentation                  |
| `e2e/tests/api/availability.spec.ts`       | Black-box E2E API tests for availability check     |
| `e2e/tests/web/availability.spec.ts`       | Black-box E2E Web UI tests for public availability |

## Testing

```bash
# Run E2E tests on Docker Compose stack
docker compose up --build -d --wait
npm run test:e2e
```

| Spec                                 | Covers                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `e2e/tests/api/availability.spec.ts` | Black-box REST API: public access, multi-table breakdown, capacity limits, BVA   |
| `e2e/tests/web/availability.spec.ts` | Black-box Web UI: public form, seat layout display, unavailable feedback, no alt |

### Try it manually

1. Start stack with `docker compose up -d`.
2. Define a slot as staff on `/staff/slots` or via `POST /api/slots`.
3. Open browser in incognito mode (no session cookies) at `http://localhost:3000/availability`.
4. Enter slot date, time, and party size.
5. Verify availability and seat breakdown.
