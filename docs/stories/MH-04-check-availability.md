# MH-04 — Check availability

|                |                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------ |
| **Status**     | API complete; Black-Box, Gray-Box, and White-Box E2E test suites complete; web client in roadmap |
| **Depends on** | MH-01 (bookings & table layout), MH-02 (slot & table setup)                                      |

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

| #   | Requirement                                                                          | Status | Implemented in                                                       |
| --- | ------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------- |
| R1  | Public access: check is accessible without authentication (no session required)      | Done   | `AvailabilityController.check`                                       |
| R2  | Input parameters: valid `date` (YYYY-MM-DD), `time` (HH:MM), and `partySize`         | Done   | `checkAvailabilityQuerySchema`, `ZodValidationPipe`                  |
| R3  | Check evaluated against free seats and table layout for the requested slot           | Done   | `AvailabilityService.check`, `BookingsRepository.findSlotStartingAt` |
| R4  | Detailed breakdown of seats across tables when available (e.g. `2 + 3 + 1`)          | Done   | `checkAvailability`, `formatBreakdown`                               |
| R5  | Clear unavailable response when party size exceeds free seats (`INSUFFICIENT_SEATS`) | Done   | `AvailabilityService.check`, `checkAvailability`                     |
| R6  | Responds unavailable (`NO_SLOT`) when no slot exists for requested date and time     | Done   | `AvailabilityService.check`                                          |
| R7  | No alternative time slots are suggested when requested slot is unavailable           | Done   | `AvailabilityResult` contract                                        |

### Decisions

- **Public endpoint.** Unlike `GET /api/slots` which is reserved for authenticated hikers planning a booking, `GET /api/availability` is public to allow casual visitors to explore availability before registering or logging in.
- **Seat breakdown format.** The response exposes structured table assignments (`tables: [{ tableNumber, seats }]`), numerical array (`breakdown: [2, 3, 1]`), and a human-readable layout summary (`breakdownText: "2 + 3 + 1 seats"`).
- **Singular vs Plural formatting.** `formatBreakdown` renders `"1 seat"` when party size is 1, and `"<n> seats"` (or `"<n1> + <n2> seats"`) for parties $> 1$.
- **TOO_LATE allocations.** When a slot starts in less than 2 hours, `available` is `false` with `reason: 'TOO_LATE'`, but table allocation and breakdown are still computed and returned so staff can review availability.
- **Strict scope.** The endpoint does not suggest alternative slots on the same or adjacent days, keeping response payloads lightweight and leaving slot exploration to the user.
- **Language.** All API messages and UI text are in English.

## How it works

1. The client sends a `GET /api/availability?date=YYYY-MM-DD&time=HH:MM&partySize=N` request (no credentials required).
2. The endpoint validates parameters with `ZodValidationPipe` using `checkAvailabilityQuerySchema` (date format, time format, positive integer party size up to `MAX_DB_INT`).
3. The service searches for an active future slot matching the date and start time via `findSlotStartingAt`.
4. If no matching slot is found or the slot has already started in the past, it responds with `available: false` and `reason: 'NO_SLOT'`.
5. If a slot exists, the service computes free seats for each table via `findFreeSeatsByTable` (subtracting seats occupied by `PENDING` and `CONFIRMED` bookings).
6. Using the seat allocation algorithm (`checkAvailability` & `allocateSeats`), the service determines whether the party fits and how it is distributed across tables.
7. If the slot starts in under 2 hours, it returns `available: false`, `reason: 'TOO_LATE'`, and the table breakdown.
8. If the party fits and is in time, the endpoint returns `200 OK` with `available: true` and the table seat breakdown. If it does not fit, it returns `available: false` with `reason: 'INSUFFICIENT_SEATS'`.

## API

### `GET /api/availability`

Public endpoint, no authentication cookies required.

| Query Parameter | Type    | Rules                                           |
| --------------- | ------- | ----------------------------------------------- |
| `date`          | string  | `YYYY-MM-DD`, valid calendar date               |
| `time`          | string  | `HH:MM`, 24-hour time                           |
| `partySize`     | integer | Positive whole number digits up to `2147483647` |

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

| Status | When                                                | `message`                               |
| ------ | --------------------------------------------------- | --------------------------------------- |
| `400`  | Invalid date, time, decimal/alphanumeric party size | `Validation failed: invalid input data` |

## Web app

- **Route:** `/availability` (Public page, planned in frontend roadmap)
- **Components:**
  - Form with Date, Time, and Party Size inputs.
  - Submit button: _"Check availability"_.
  - Result Card:
    - Available: confirmation banner with seat breakdown detail (e.g. _"Table layout: 2 + 3 + 1 seats"_).
    - Unavailable: warning notice stating that the slot cannot accommodate the requested party size.
    - No alternative slots are displayed or suggested.

## Code map

| Path                                               | Content                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/shared/src/bookings.ts`                  | `checkAvailabilityQuerySchema`, `AvailabilityResult` definitions |
| `apps/api/src/bookings/availability.controller.ts` | Public REST controller for `/api/availability`                   |
| `apps/api/src/bookings/availability.service.ts`    | Service orchestrating slot search, availability, and breakdown   |
| `apps/api/src/bookings/booking-policy.ts`          | Core `checkAvailability` and `formatBreakdown` logic             |
| `apps/api/src/bookings/bookings.repository.ts`     | `findSlotStartingAt` and `findFreeSeatsByTable` raw queries      |
| `e2e/tests/api/availability.spec.ts`               | Black-Box, Gray-Box, and White-Box Playwright E2E API tests      |
| `e2e/tests/web/availability.spec.ts`               | Playwright Web E2E UI test specifications                        |

## Testing

```bash
# Run E2E tests on Docker Compose stack
docker compose up --build -d --wait
npm run test:e2e
```

| Spec                                             | Covers                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `e2e/tests/api/availability.spec.ts` (Black-Box) | Requirements R1..R7: public access, multi-table breakdown, capacity limits, BVA, stateless cookies       |
| `e2e/tests/api/availability.spec.ts` (Gray-Box)  | Direct DB seeding: `<2h` imminent slots (`TOO_LATE`), past slots (`NO_SLOT`), empty slots, PENDING seats |
| `e2e/tests/api/availability.spec.ts` (White-Box) | Internal branches: `formatBreakdown` singular/plural, `smallestFit` tie-breaker, greedy table layout     |
| `e2e/tests/web/availability.spec.ts`             | Black-box Web UI: public form, seat layout display, unavailable feedback, no alternative suggestions     |

### Try it manually

1. Start stack with `docker compose up -d`.
2. Define a slot as staff via `POST /api/slots`.
3. Send a public curl request without cookies:
   `curl "http://localhost:3000/api/availability?date=<YYYY-MM-DD>&time=<HH:MM>&partySize=<N>"`
4. Verify availability response and breakdown formatting.
