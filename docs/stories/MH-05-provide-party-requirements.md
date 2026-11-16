# MH-05 — Provide party requirements

|                |                                                                            |
| -------------- | -------------------------------------------------------------------------- |
| **Status**     | API complete with unit, integration and E2E API tests; web app in progress |
| **Depends on** | MH-01 (bookings domain, book a table), MH-03 (receive confirmation)        |

## User story

**Business value:** 970

As a hiker,  
I want to specify dietary restrictions and allergies for people in my party,  
So that the hut can prepare suitable meals safely.

### Notes & Clarifications

- **Allergies flag:** In case of allergies, a flag must be checked to notify that special care is needed during the preparation. The allergies flag can be simply a checkbox to make explicit that it is an important safety issue.
- **Details description:** The details of each requirement are described in a text field.
- **Subsets of the party:** Multiple requirements can be specified for subsets of the party.
- **List of requirements:** It must be possible to enter multiple requirements for subsets of the party. A list of requirements per booking, each with its own allergies flag and description.
- **Example list:**
  1. `allergies: yes` (`true`), `"1 vegan, peanut allergy"`
  2. `allergies: yes` (`true`), `"1 shellfish allergy"`
  3. `allergies: no` (`false`), `"2 vegetarians"`

## Requirements

| #   | Requirement                                                                                           | Status                    | Implemented in                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| R1  | Hiker can provide a list of dietary requirements and allergies when booking a table                   | API done; web in progress | `POST /api/bookings`, `BookingsService.create`; booking page _(MOU-107)_                                           |
| R2  | Each requirement entry contains an allergies flag (`allergies: boolean`) and a description (`string`) | Done                      | `partyRequirementSchema`, `PartyRequirement`, `party_requirements` table                                           |
| R3  | When allergies are present, the allergies flag indicates that special care is needed during food prep | Done                      | `PartyRequirement.allergies`, `bookingConfirmationEmail` (`Allergies (special care needed)`)                       |
| R4  | Multiple requirements can be specified for distinct subsets of the party                              | API done; web in progress | `BookingsRepository.createBooking`; booking page _(MOU-107)_                                                       |
| R5  | Dietary restrictions without allergies have the allergies flag unset (`allergies: false`)             | Done                      | `PartyRequirement` with `allergies: false`                                                                         |
| R6  | Party requirements are optional (a booking can be created with empty or no requirements)              | Done                      | `createBookingSchema` (optional `requirements`), `BookingsService.create`                                          |
| R7  | Validation: each provided requirement must have a non-empty description within length limits          | Done                      | `partyRequirementSchema` (`min(1)`, `max(500)`, no NUL byte), `createBookingSchema` (`max(20)` items)              |
| R8  | Requirements and allergy alerts are persisted and reflected in booking confirmations and emails       | API done; web in progress | `party_requirements` table, `findBookingConfirmation`, `bookingConfirmationEmail`; confirmation dialog _(MOU-107)_ |

### Decisions

- **Structured requirements list.** Instead of a single free-text note, requirements are a list of objects (`{ allergies: boolean; description: string }[]`), one per subset of the party, so allergies are tracked explicitly.
- **Explicit allergy flag.** `allergies: true` is the safety signal for the kitchen: the confirmation email marks those lines with `Allergies (special care needed)`.
- **Free-text description per subset.** Each entry describes the needs of a subset in words (e.g. "1 vegan, peanut allergy", "2 vegetarians"), which covers any combination of diets and allergies.
- **Optional.** A booking without needs omits `requirements` or sends `[]`; the response then has `requirements: []`.
- **Input limits.** Each description is trimmed, 1–500 characters, without NUL bytes; at most 20 entries per booking, only as a limit against abuse (one entry can cover several people).
- **Own table, same transaction.** The entries are stored in `party_requirements` in the same transaction as the booking and its tables, with a single insert, so their ids follow the order the hiker entered. A refused booking (no seats, too late, missing slot, duplicate booking) stores no entry.
- **Deleted with the booking.** `party_requirements.booking_id` has `ON DELETE CASCADE`.
- **Existing data.** The migration turns each old free-text requirement into one entry and flags it as an allergy: the old text does not say whether it was one, and a wrong warning is safer for the kitchen than a missing one. The old `bookings.requirements` column is then dropped.
- **Email.** One line per entry, in the order entered; no requirements line when there are none. Descriptions are HTML-escaped in the HTML version.
- **Language.** All user interface labels, alerts, and API error messages are in English.

## How it works

1. An authenticated hiker sends `POST /api/bookings` with the slot, the party size and, optionally, the list of requirements. In the web app this happens on `/book` (see [Web app](#web-app)).
2. `ZodValidationPipe(createBookingSchema)` validates the body: every entry needs a boolean `allergies` and a valid `description`; unknown fields are removed and descriptions are trimmed.
3. In one transaction (MH-01), `BookingsService.create` checks the hiker profile, locks the slot, checks the 2-hour cutoff and the seats, then stores the booking with its requirements and its table assignments.
4. The API answers `201 Created` with the booking, its tables and its requirements.
5. After the commit, the confirmation email (MH-03) lists the requirements read back from the database, marking the allergy ones.

## API

### `POST /api/bookings`

Protected endpoint, requires session cookie of an authenticated `HIKER`.

| Body Field                   | Type    | Rules                                                                              |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `slotId`                     | integer | Positive integer, existing future time slot                                        |
| `partySize`                  | integer | Positive integer, must fit in free slot seats                                      |
| `requirements`               | array   | Optional list of requirement objects (maximum 20 items)                            |
| `requirements[].allergies`   | boolean | Required boolean (`true` if allergies require special care)                        |
| `requirements[].description` | string  | Required non-empty string, trimmed, 1–500 characters, no NUL (`\u0000`) characters |

#### Example Request: Booking with multiple requirements for party subsets

```bash
curl -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/bookings \
  -d '{
    "slotId": 12,
    "partySize": 4,
    "requirements": [
      { "allergies": true, "description": "1 vegan, peanut allergy" },
      { "allergies": true, "description": "1 shellfish allergy" },
      { "allergies": false, "description": "2 vegetarians" }
    ]
  }'
```

Response `201 Created`:

```json
{
  "id": 42,
  "slotId": 12,
  "partySize": 4,
  "status": "PENDING",
  "tables": [{ "tableNumber": 1, "assignedSeats": 4 }],
  "requirements": [
    { "allergies": true, "description": "1 vegan, peanut allergy" },
    { "allergies": true, "description": "1 shellfish allergy" },
    { "allergies": false, "description": "2 vegetarians" }
  ]
}
```

### Errors

| Status | When                                                                                   | `message`                                            |
| ------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `400`  | Body is invalid (missing description, invalid types, empty text, NUL bytes, >20 items) | `Invalid data` (details in `issues`)                 |
| `401`  | No valid session cookie                                                                | `Not authenticated`                                  |
| `403`  | The user is not a `HIKER`                                                              | `Operation not allowed for your role`                |
| `403`  | The user has no hiker profile                                                          | `A hiker profile is required to book a table`        |
| `404`  | The slot does not exist                                                                | `Slot not found`                                     |
| `409`  | The hiker already has an active booking for the slot                                   | `You already have a booking for this slot`           |
| `409`  | Not enough free seats                                                                  | `Insufficient seats available for this slot`         |
| `422`  | Less than 2 hours before the slot starts                                               | `Less than 2 hours remaining before the slot starts` |

## Web app

In progress (frontend integration, MOU-107, branch `feature/MH-05-UI`). Planned, as described by `e2e/tests/web/party-requirements.spec.ts`:

- **Route:** `/book`.
- **Party requirements controls:** "Add requirement" to append a row; per row an "Allergies" checkbox for special care, a "Details" text field (e.g. `1 vegan, peanut allergy`) and a "Remove" button.
- **Feedback:** the confirmation dialog lists the requirements, with allergy items marked.
- **Accessibility:** labels tied to controls via `id`/`htmlFor`; checkboxes with an explicit accessible name.

## Data model

| Table                | Column        | Type      | Description                                              |
| -------------------- | ------------- | --------- | -------------------------------------------------------- |
| `party_requirements` | `id`          | `SERIAL`  | Primary key; follows the order the hiker entered         |
| `party_requirements` | `booking_id`  | `INTEGER` | Foreign key referencing `bookings(id)` on delete cascade |
| `party_requirements` | `allergies`   | `BOOLEAN` | Whether special care is needed for allergens             |
| `party_requirements` | `description` | `TEXT`    | Dietary / allergy description for the subset             |

The column `bookings.requirements` (free text, MH-03) is removed; its non-empty values are moved to `party_requirements` with `allergies = true`.

Migrations:

- `20261111095430_party_requirements`

## Configuration

No new environment variables required.

## Code map

| Path                                                                | Content                                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/bookings.ts`                                   | `partyRequirementSchema`, `PartyRequirement`, `MAX_REQUIREMENTS_COUNT`, `requirements` in `createBookingSchema` and `BookingResult`               |
| `apps/api/prisma/schema.prisma`                                     | `PartyRequirement` model and relation to `Booking`                                                                                                |
| `apps/api/prisma/migrations/20261111095430_party_requirements`      | `party_requirements` table, move of the old free-text requirements                                                                                |
| `apps/api/src/bookings/bookings.repository.ts`                      | Stores the requirements with the booking; reads them in order for the confirmation                                                                |
| `apps/api/src/bookings/bookings.service.ts`                         | Passes the requirements to the repository and returns them                                                                                        |
| `apps/api/src/notifications/templates/booking-confirmation.ts`      | Email lines for the requirements, with the allergy label                                                                                          |
| `packages/shared/src/bookings.spec.ts`                              | Unit tests for party requirement schema validation                                                                                                |
| `apps/api/src/bookings/bookings.controller.spec.ts`                 | `POST /api/bookings`: `400` without calling the service for invalid requirements; valid ones reach the service trimmed and without unknown fields |
| `apps/api/src/bookings/bookings.service.spec.ts`                    | Service unit tests for party requirements orchestration                                                                                           |
| `apps/api/src/bookings/bookings.repository.spec.ts`                 | Repository unit tests for party requirements persistence                                                                                          |
| `apps/api/src/notifications/templates/booking-confirmation.spec.ts` | Email template unit tests verifying allergy warnings & HTML                                                                                       |
| `apps/api/test/integration/confirmation.int-spec.ts`                | Integration tests for DB persistence & email notifications                                                                                        |
| `apps/api/test/party-requirements.int-spec.ts`                      | Integration tests for party requirements on PostgreSQL                                                                                            |
| `e2e/tests/api/party-requirements.spec.ts`                          | E2E black-box API tests for party requirements and allergies                                                                                      |
| `e2e/tests/web/party-requirements.spec.ts`                          | E2E black-box Web UI tests for party requirements booking flow (skipped until the web app is done)                                                |

## Testing

Run unit tests:

```bash
npm run test -w @mountain-hut/shared
npm run test -w @mountain-hut/api
```

Run integration tests against PostgreSQL:

```bash
docker compose up -d db
npm run test:int
```

Run end-to-end tests, against the running Docker stack:

```bash
docker compose up --build -d --wait
npm run e2e:api -w @mountain-hut/e2e -- tests/api/party-requirements.spec.ts
npm run e2e:web -w @mountain-hut/e2e -- tests/web/party-requirements.spec.ts
```

| Spec                                                                | Covers                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/bookings.spec.ts`                              | Schema validation: allergies flag, description trimming, NUL byte rejection, max length 500, max count 20, missing fields, unknown fields removed, order kept                                                                                                                                                                |
| `apps/api/src/bookings/bookings.service.spec.ts`                    | Service orchestration: stores party requirements, returns requirements array                                                                                                                                                                                                                                                 |
| `apps/api/src/bookings/bookings.repository.spec.ts`                 | Repository persistence: creates party requirements in DB, finds confirmation with requirements in insert order, empty list when there are none                                                                                                                                                                               |
| `apps/api/src/notifications/templates/booking-confirmation.spec.ts` | Email template: allergy special care warnings (also on every line, as in the story example), HTML escaping, empty requirements omission                                                                                                                                                                                      |
| `apps/api/test/integration/confirmation.int-spec.ts`                | Integration: DB persistence of party_requirements, confirmation email dispatch                                                                                                                                                                                                                                               |
| `apps/api/test/party-requirements.int-spec.ts`                      | Integration: order kept and returned, 20 entries, 500 characters and non-ASCII text, bookings kept apart, cascade delete; refused bookings (seats, cutoff, missing slot, no hiker profile, duplicate, race for the last seats) leave no entry; email from the database with allergy label, HTML escaping, no line when empty |
| `e2e/tests/api/party-requirements.spec.ts`                          | Black-box API: multiple requirements, allergy flag, empty/omitted requirements, length/count boundaries, whitespace trimming, NUL bytes, HTML escaping in emails, RBAC and auth                                                                                                                                              |
| `e2e/tests/web/party-requirements.spec.ts`                          | Black-box Web (skipped until the web app is done): dynamic UI rows, allergy checkbox, add/remove, confirmation dialog, validation alerts, unauthenticated redirect                                                                                                                                                           |

### Try it manually

1. Start the stack with `docker compose up --build -d`.
2. Log in as a hiker, for example from Swagger at http://localhost:3000/api/docs (`POST /api/auth/login`).
3. Send `POST /api/bookings` with the example body above (use an existing future `slotId` from `GET /api/slots`): the answer lists the 3 requirements.
4. Send a booking with `"requirements": []` or without the field: the answer has `requirements: []`.
5. Open Mailpit at http://localhost:8025: the confirmation email lists the requirements in order, the allergy ones marked `Allergies (special care needed)`.
6. When the web app is done: on `/book`, add the 3 requirements of the example and book; the confirmation dialog lists them.

## Open points

- **Web app:** frontend integration in progress (MOU-107); then unskip `e2e/tests/web/party-requirements.spec.ts` and complete [Web app](#web-app).
- **MH-06 (change a booking):** the change of a booking must accept the same list (the MH-06 frontend already sends it); `changeBookingSchema` still takes a single text.
- Multiple requirements UI layout optimization for small mobile viewports.
- Kitchen dashboard integration to summarize total allergen counts across all daily bookings.
- **MH-04 Integration:** When merged with story MH-04 (Check availability), unskip availability test suites (`e2e/tests/api/availability.spec.ts`, `e2e/tests/web/availability.spec.ts`) and add end-to-end integration tests validating the user journey from `/availability` checks to booking with party requirements & allergies.
