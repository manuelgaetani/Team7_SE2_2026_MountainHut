# MH-04 — Check availability

|                |                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| **Status**     | API and web page complete; API unit, integration and E2E tests complete; web E2E tests still skipped |
| **Depends on** | MH-01 (bookings & table layout), MH-02 (slot & table setup)                                          |

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

| #   | Requirement                                                                          | Status | Implemented in                                               |
| --- | ------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------ |
| R1  | Public access: check is accessible without authentication (no session required)      | Done   | `AvailabilityController.check`                               |
| R2  | Input parameters: valid `date` (YYYY-MM-DD), `time` (HH:MM), and `partySize`         | Done   | `checkAvailabilityQuerySchema`, `ZodValidationPipe`          |
| R3  | Check evaluated against free seats and table layout for the requested slot           | Done   | `AvailabilityService.check`, `BookingsRepository.findSlotAt` |
| R4  | Detailed breakdown of seats across tables when available (e.g. `2 + 3 + 1`)          | Done   | `checkAvailability`, `formatBreakdown`                       |
| R5  | Clear unavailable response when party size exceeds free seats (`INSUFFICIENT_SEATS`) | Done   | `AvailabilityService.check`, `checkAvailability`             |
| R6  | Responds unavailable (`NO_SLOT`) when no slot exists for requested date and time     | Done   | `AvailabilityService.check`                                  |
| R7  | No alternative time slots are suggested when requested slot is unavailable           | Done   | `AvailabilityResult` contract                                |

### Decisions

- **Public endpoint.** Unlike `GET /api/slots` which is reserved for authenticated hikers planning a booking, `GET /api/availability` is public to allow casual visitors to explore availability before registering or logging in.
- **Seat breakdown format.** The response exposes structured table assignments (`tables: [{ tableNumber, seats }]`), numerical array (`breakdown: [2, 3, 1]`), and a human-readable layout summary (`breakdownText: "2 + 3 + 1 seats"`).
- **Singular vs Plural formatting.** `formatBreakdown` renders `"1 seat"` when party size is 1, and `"<n> seats"` (or `"<n1> + <n2> seats"`) for parties $> 1$.
- **TOO_LATE allocations.** When a slot starts in less than 2 hours, `available` is `false` with `reason: 'TOO_LATE'`, but table allocation and breakdown are still computed and returned so staff can review availability.
- **Time inside a slot.** The `time` does not have to be the start of a slot: the check uses the slot that includes it (start included, end excluded), e.g. `12:34` checks the slot `12:00–13:00`, and where two contiguous slots meet (`13:00`) the later one is used. The response gives the start and end of that slot in `slot`.
- **Strict scope.** The endpoint does not suggest alternative slots on the same or adjacent days, keeping response payloads lightweight and leaving slot exploration to the user.
- **Booking from the result.** The check does not book. An available result links to the booking page of MH-01 with the date, the slot and the party size in the address (`bookingPath`), read back by `draftFromSearch`; the user still confirms the booking there.
- **Redirect after sign in.** A visitor keeps the chosen booking through registration and sign in with `?next=`. `safeNext` accepts only paths of the app (starting with `/`, not `//` or `/\`), so the link cannot send the user to another site.
- **Language.** All API messages and UI text are in English.

## How it works

1. The client sends a `GET /api/availability?date=YYYY-MM-DD&time=HH:MM&partySize=N` request (no credentials required).
2. The endpoint validates parameters with `ZodValidationPipe` using `checkAvailabilityQuerySchema` (date format, time format, positive integer party size up to `MAX_DB_INT`).
3. The service searches, via `findSlotAt`, for the slot of that date that includes the time (start at or before it, end after it) and has not started yet.
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
| `time`          | string  | `HH:MM`, 24-hour time, any time inside a slot   |
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
  "slot": { "startTime": "12:00", "endTime": "14:00" },
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
  "slot": { "startTime": "12:00", "endTime": "14:00" },
  "totalFreeSeats": 10,
  "reason": "INSUFFICIENT_SEATS"
}
```

### Errors

| Status | When                                                | `message`      |
| ------ | --------------------------------------------------- | -------------- |
| `400`  | Invalid date, time, decimal/alphanumeric party size | `Invalid data` |

## Web app

- **Route:** `/availability`, public. The home page links to it with **Check availability**, next to the booking button.
- **Form:** `Date` (today by default), `Time` and `Party size` (2 by default), then **Check availability**. The values are validated with the same `checkAvailabilityQuerySchema` as the API, with one message per field (`Choose a date.`, `Choose a time.`, `Enter the number of people, 1 or more.`). Changing a field hides the previous answer.
- **While checking:** the button shows `Checking…` and is disabled; `Checking the slot…` has `role="status"`.
- **Available:** card with `Available`, the slot asked (e.g. `Sat 15 Jun, slot 12:00–13:30, for 3 people`), `Table layout: 2 + 3 + 1 seats` and the list **Tables for the party** (`Table 1 · 2 seats`), announced with `aria-live="polite"`.
- **Not available:** card with `role="alert"`, `Not available` and the reason:
  - `NO_SLOT`: `There is no time slot at <time> on <date>. Try another date or time.`
  - `TOO_LATE`: `The slot starts in less than 2 hours, so it can no longer be booked online.`
  - `INSUFFICIENT_SEATS`: `Insufficient seats: the slot is full.` or `Insufficient seats: the slot has only <n> free seats.`
- **Errors:** `400` shows `Check the date, the time and the party size.`; any other error shows `The check failed. Please try again.`
- **From the result to a booking:** a signed-in user gets **Book a table**, which opens `/book?date=&time=&partySize=` with the date, the slot (its start time) and the party size already chosen. A visitor gets **Register to book a table** and **Sign in**, which carry the same booking page in `?next=`: after registration the user goes to sign in, and after sign in lands on that booking page.
- **No alternative slots** are shown or suggested.

## Data model

No tables or migrations are added: the check only reads the tables of MH-01 and MH-02.

| Table            | Use in this story                                                     |
| ---------------- | --------------------------------------------------------------------- |
| `slots`          | Finds the slot whose start and end include the date and time asked    |
| `slot_tables`    | Tables of the slot and their seats                                    |
| `bookings`       | Only `PENDING` and `CONFIRMED` bookings take seats; `REJECTED` do not |
| `booking_tables` | Seats already assigned to each table of the slot                      |

The check never writes to the database.

## Configuration

| Variable           | Default       | Purpose                                                                                                 |
| ------------------ | ------------- | ------------------------------------------------------------------------------------------------------- |
| `BOOKING_TIMEZONE` | `Europe/Rome` | Time zone used to read the date and time of a slot and to compare them with now (`NO_SLOT`, `TOO_LATE`) |

`docker-compose.yml` passes this variable to the `app` container.

## Code map

| Path                                                                                           | Content                                                               |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/shared/src/bookings.ts`                                                              | `checkAvailabilityQuerySchema`, `AvailabilityResult` definitions      |
| `apps/api/src/bookings/presentation/availability.controller.ts`                                | Public REST controller for `/api/availability`                        |
| `apps/api/src/bookings/application/availability.service.ts`                                    | Service orchestrating slot search, availability, and breakdown        |
| `apps/api/src/bookings/domain/booking-policy.ts`                                               | Core `checkAvailability` and `formatBreakdown` logic                  |
| `apps/api/src/bookings/application/bookings.repository.port.ts`                                | `findSlotAt` and `findFreeSeatsByTable` port                          |
| `apps/api/src/bookings/infrastructure/prisma-bookings.repository.ts`                           | Prisma implementation of the two queries                              |
| `apps/api/test/availability.int-spec.ts`                                                       | Integration tests with PostgreSQL                                     |
| `e2e/tests/api/availability.spec.ts`                                                           | Black-Box, Gray-Box, and White-Box Playwright E2E API tests           |
| `e2e/tests/web/availability.spec.ts`                                                           | Playwright Web E2E UI tests (still in `describe.skip`)                |
| `apps/web/src/pages/AvailabilityPage.tsx`                                                      | Public page: form, client validation, result card, links to book      |
| `apps/web/src/pages/AvailabilityPage.css`                                                      | Styles of the form and of the result card                             |
| `apps/web/src/api/availability.ts`                                                             | `fetchAvailability`: `GET /api/availability` without session          |
| `apps/web/src/api/useAvailability.ts`                                                          | TanStack Query hook, runs only once a check is submitted              |
| `apps/web/src/lib/availability.ts`                                                             | Texts of the result: asked slot, reason when not available, errors    |
| `apps/web/src/lib/bookingRedirect.ts`                                                          | Booking link, `?next=` for sign in and registration, `safeNext` check |
| `apps/web/src/router.tsx`                                                                      | `/availability` route                                                 |
| `apps/web/src/pages/HomePage.tsx`                                                              | **Check availability** link in the home page                          |
| `apps/web/src/pages/BookingPage.tsx`                                                           | Reads date, slot and party size from the address                      |
| `apps/web/src/pages/LoginPage.tsx`, `RegisterPage.tsx`, `apps/web/src/components/AuthTabs.tsx` | Keep `?next=` and go there after sign in or registration              |

## Testing

```bash
# Unit tests
npm test -w @mountain-hut/api
npm test -w @mountain-hut/web
# Integration tests (PostgreSQL, uses the "<db>_test" database)
npm run test:int -w @mountain-hut/api -- availability
# E2E tests on Docker Compose stack
docker compose up --build -d --wait
npm run test:e2e
```

| Spec                                                                      | Covers                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/bookings/domain/booking-policy.spec.ts`                     | `checkAvailability` and the 2-hour limit: exact fit, one seat over, full or overbooked tables, decision table (white-box)                                                     |
| `apps/api/src/bookings/application/availability.service.spec.ts`          | Results `NO_SLOT`, `INSUFFICIENT_SEATS`, `TOO_LATE` with seating, tables/breakdown alignment, configured time zone, no alternative slots                                      |
| `apps/api/src/bookings/presentation/availability.controller.spec.ts`      | Public route without auth guard, party size as a number, unknown query parameters removed, 500 on unexpected errors                                                           |
| `apps/api/src/bookings/infrastructure/prisma-bookings.repository.spec.ts` | `findSlotAt` (slot that includes the time, earliest then oldest slot, started slots ignored) and `findFreeSeatsByTable` (PENDING and CONFIRMED only), bound values            |
| `apps/web/src/api/availability.test.ts`                                   | `fetchAvailability`: query parameter encoding for `/api/availability`, `ApiError` status propagation                                                                          |
| `apps/web/src/lib/availability.test.ts`                                   | `peopleLabel`, `askedLabel`, `unavailableReason` (`NO_SLOT`, `TOO_LATE`, `INSUFFICIENT_SEATS`), and `availabilityError` formatting                                            |
| `apps/web/src/lib/bookingRedirect.test.ts`                                | `bookingPath`, `authPath`, `safeNext` open-redirect guard, and `draftFromSearch` query parsing                                                                                |
| `apps/web/src/pages/AvailabilityPage.test.tsx`                            | Public `/availability` form, client validation, loading state, available/unavailable cards, anonymous vs signed-in links, field reset, API/network errors (`useAvailability`) |
| `apps/web/src/pages/BookingPage.test.tsx`                                 | Prefill date/slot/party size from availability `?date=&time=&partySize=`, fallback when slot is missing, staff access check                                                   |
| `apps/web/src/pages/LoginPage.test.tsx`, `RegisterPage.test.tsx`          | Preserving safe `?next=` across sign-in and registration (`AuthTabs`) and rejecting unsafe external redirects                                                                 |
| `apps/api/test/availability.int-spec.ts`                                  | Real PostgreSQL: slot lookup in the hut time zone, contiguous slots, PENDING/CONFIRMED vs REJECTED seats, read-only check                                                     |
| `e2e/tests/api/availability.spec.ts` (Black-Box)                          | Requirements R1..R7: public access, multi-table breakdown, capacity limits, BVA, stateless cookies                                                                            |
| `e2e/tests/api/availability.spec.ts` (Gray-Box)                           | Direct DB seeding: `<2h` imminent slots (`TOO_LATE`), past slots (`NO_SLOT`), empty slots, PENDING seats                                                                      |
| `e2e/tests/api/availability.spec.ts` (White-Box)                          | Internal branches: `formatBreakdown` singular/plural, `smallestFit` tie-breaker, greedy table layout                                                                          |
| `e2e/tests/web/availability.spec.ts`                                      | Black-box Web UI: public form, seat layout display, unavailable feedback, no alternative suggestions, from the result to registration and booking (still in `describe.skip`)  |

### Try it manually

1. Start the stack with `docker compose up --build -d --wait`.
2. Sign in as staff and create a slot at http://localhost:3000/staff/slots (or via `POST /api/slots`).
3. Sign out, open http://localhost:3000 and follow **Check availability**.
4. Enter the date, a time inside the slot and the party size, then press **Check availability**:
   - a party that fits shows **Available**, the slot, the table layout and the tables;
   - a party that does not fit, a time with no slot, or a slot starting in less than 2 hours shows **Not available** with the reason.
5. From an available result press **Register to book a table**, register, sign in: the booking page opens with the date, the slot and the party size already chosen.
6. The API can also be called without cookies:
   `curl "http://localhost:3000/api/availability?date=<YYYY-MM-DD>&time=<HH:MM>&partySize=<N>"`

## Open points

- None.
