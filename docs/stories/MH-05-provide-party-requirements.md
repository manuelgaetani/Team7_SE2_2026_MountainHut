# MH-05 — Provide party requirements

|                |                                                                     |
| -------------- | ------------------------------------------------------------------- |
| **Status**     | Complete: API and web app, with unit, integration and E2E tests     |
| **Depends on** | MH-01 (bookings domain, book a table), MH-03 (receive confirmation) |

## User story

**Business value:** 970

As a hiker,  
I want to specify dietary restrictions and allergies for people in my party,  
So that the hut can prepare suitable meals safely.

### Notes

In case of allergies a flag must be checked to notify that special care is needed during the preparation. The details are described in a text field. Multiple requirements can be specified for subsets of the party.

### Clarifications

- The allergies flags can be simply a checkbox to be selected in case of allergies to make explicit that it is an important issue.
- It must be possible to enter multiple requirements for subsets of the party. A list of requirements per booking, each with its own allergies flag and description.  
  E.g., three requirements:
  - allergies: yes, "1 vegan, peanut allergy"
  - allergies: yes, "1 shellfish allergy"
  - allergies: no, "2 vegetarians"

## Requirements

| #   | Requirement                                                                                           | Status | Implemented in                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| R1  | Hiker can provide a list of dietary requirements and allergies when booking a table                   | Done   | `POST /api/bookings`, `BookingsService.create`; `RequirementsEditor` in `BookingPage`                                       |
| R2  | Each requirement entry contains an allergies flag (`allergies: boolean`) and a description (`string`) | Done   | `partyRequirementSchema`, `PartyRequirement`, `party_requirements` table                                                    |
| R3  | When allergies are present, the allergies flag indicates that special care is needed during food prep | Done   | `PartyRequirement.allergies`, `bookingConfirmationEmail` (`Allergies (special care needed)`)                                |
| R4  | Multiple requirements can be specified for distinct subsets of the party                              | Done   | `BookingsRepository.createBooking`; `RequirementsEditor` (add and remove rows)                                              |
| R5  | Dietary restrictions without allergies have the allergies flag unset (`allergies: false`)             | Done   | `PartyRequirement` with `allergies: false`                                                                                  |
| R6  | Party requirements are optional (a booking can be created with empty or no requirements)              | Done   | `createBookingSchema` (optional `requirements`), `BookingsService.create`                                                   |
| R7  | Validation: each provided requirement must have a non-empty description within length limits          | Done   | `partyRequirementSchema` (`min(1)`, `max(500)`, no NUL byte), `createBookingSchema` (`max(20)` items); `BookingPage` alerts |
| R8  | Requirements and allergy alerts are persisted and reflected in booking confirmations and emails       | Done   | `party_requirements` table, `findBookingConfirmation`, `bookingConfirmationEmail`; `BookingSentDialog`                      |

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
- **Needs of the hut (suggestion from Team 16).** The common needs are picked, not typed: `DIETARY_OPTIONS` in `@mountain-hut/shared` lists them (`GLUTEN_FREE` "Gluten-free", `LACTOSE_FREE` "Lactose-free", `EGG_FREE` "Egg-free", `NUT_FREE` "Nut-free", `SOY_FREE` "Soy-free", `VEGAN` "Vegan"), so the same need always has the same name for the kitchen. Each entry stores the picked codes in `restrictions`; `description` keeps only what is not in the list ("Other"), and `allergies` flags that free text. `hasAllergy` marks an entry when a picked need is an allergen (all but Vegan, which is a choice) or the free text is flagged. The list is one constant shared by API and web: a hut-specific list editable by the warden is an open point.

## How it works

1. An authenticated hiker sends `POST /api/bookings` with the slot, the party size and, optionally, the list of requirements. In the web app this happens on `/book` (see [Web app](#web-app)).
2. `ZodValidationPipe(createBookingSchema)` validates the body: every entry needs a boolean `allergies` and a valid `description`; unknown fields are removed and descriptions are trimmed.
3. In one transaction (MH-01), `BookingsService.create` checks the hiker profile, locks the slot, checks the 2-hour cutoff and the seats, then stores the booking with its requirements and its table assignments.
4. The API answers `201 Created` with the booking, its tables and its requirements.
5. After the commit, the confirmation email (MH-03) lists the requirements read back from the database, marking the allergy ones.

## API

### `POST /api/bookings`

Protected endpoint, requires session cookie of an authenticated `HIKER`.

| Body Field                    | Type    | Rules                                                                                                       |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| `slotId`                      | integer | Positive integer, existing future time slot                                                                 |
| `partySize`                   | integer | Positive integer, must fit in free slot seats                                                               |
| `requirements`                | array   | Optional list of requirement objects (maximum 20 items)                                                     |
| `requirements[].restrictions` | array   | Optional, default `[]`: codes of `DIETARY_OPTIONS`, each at most once                                       |
| `requirements[].allergies`    | boolean | Required boolean (`true` if the free text is an allergy that requires special care)                         |
| `requirements[].description`  | string  | Required string, trimmed, 0–500 characters, no NUL (`\u0000`); may be empty only when `restrictions` is not |

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

- **Route:** `/book` (`BookingPage`), only for a signed-in hiker: a signed-out visitor sees the "Log in to book a table" notice and no requirement controls.
- **Needs of the hut (Team 16):** each row shows one toggle tile per need of `DIETARY_OPTIONS`, with its icon (`DietaryIcons.tsx`) and its name under it, then an "Other" tile. Several tiles can be picked; a picked tile is filled and shows a tick. "Other" opens the "Other need" text field (focused) with an "Allergy or intolerance" checkbox, so a need that is not in the list can always be written. The tiles are checkboxes, so they work with Tab and Space. Wherever requirements are listed (summary, booking sent dialog, My bookings card, staff recap) `RequirementLine` shows the allergy badge, the picked needs as small tags with their icon, then the free text. A row with nothing picked shows "Choose at least one need, or remove this requirement."; Other with no text shows "Describe the other need, or untick Other."
- **Party requirements controls (`RequirementsEditor`):** the "Add a requirement" button (then "Add another requirement") appends a row; it is disabled at 20 rows (`MAX_REQUIREMENTS_COUNT`). Each row is a group named "Requirement n" with a "Details" text field (e.g. `2 vegetarians`), an "Allergies" checkbox for special care and a "Remove" button. No row is shown by default: a booking without needs sends no `requirements`.
- **Validation before sending:** an empty row shows the alert "Describe each requirement or remove it."; a description longer than 500 characters (`MAX_REQUIREMENTS_LENGTH`) shows "Each requirement can be at most 500 characters long." The field does not cut the text, so the hiker sees why the booking is refused. In both cases no request is sent.
- **Side summary (`BookingSummary`):** when there are filled rows, a green box "Requirements:" lists them, the allergy ones followed by "(allergies)".
- **Feedback (`BookingSentDialog`):** after the booking the dialog lists the requirements in the order entered; the allergy ones start with `Allergies (special care needed)`, the same label as the confirmation email. Closing the dialog clears the rows.
- **Accessibility:** each row is a `fieldset` with a `legend`, so the controls inside keep short names; the text field is tied to its label via `id`/`htmlFor`, the checkbox is wrapped in its label.

## Data model

| Table                | Column         | Type      | Description                                                  |
| -------------------- | -------------- | --------- | ------------------------------------------------------------ |
| `party_requirements` | `id`           | `SERIAL`  | Primary key; follows the order the hiker entered             |
| `party_requirements` | `booking_id`   | `INTEGER` | Foreign key referencing `bookings(id)` on delete cascade     |
| `party_requirements` | `allergies`    | `BOOLEAN` | Whether special care is needed for allergens                 |
| `party_requirements` | `description`  | `TEXT`    | Dietary / allergy description for the subset                 |
| `party_requirements` | `restrictions` | `TEXT[]`  | Codes of `DIETARY_OPTIONS` picked by the hiker; default `{}` |

The column `bookings.requirements` (free text, MH-03) is removed; its non-empty values are moved to `party_requirements` with `allergies = true`.

Migrations:

- `20261111095430_party_requirements`
- `20261125100000_party_requirement_restrictions` (existing rows get `restrictions = {}`)

## Configuration

No new environment variables required.

## Code map

| Path                                                                | Content                                                                                                                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/bookings.ts`                                   | `partyRequirementSchema`, `PartyRequirement`, `MAX_REQUIREMENTS_COUNT`, `MAX_REQUIREMENTS_LENGTH`, `requirements` in `createBookingSchema` and `BookingResult` |
| `apps/web/src/components/RequirementsEditor.tsx`                    | Rows of requirements: add, edit, flag allergies, remove                                                                                                        |
| `apps/web/src/components/BookingSentDialog.tsx`                     | Confirmation dialog, with the list of requirements and the allergy label                                                                                       |
| `apps/web/src/components/BookingSummary.tsx`                        | Side summary with the green box of the requirements                                                                                                            |
| `apps/web/src/pages/BookingPage.tsx`                                | Requirements state, checks before sending, requirements in the request and in the dialog                                                                       |
| `apps/web/src/pages/BookingPage.css`                                | Styles of the requirement rows and of the list in the dialog                                                                                                   |
| `apps/api/prisma/schema.prisma`                                     | `PartyRequirement` model and relation to `Booking`                                                                                                             |
| `apps/api/prisma/migrations/20261111095430_party_requirements`      | `party_requirements` table, move of the old free-text requirements                                                                                             |
| `apps/api/src/bookings/bookings.repository.ts`                      | Stores the requirements with the booking; reads them in order for the confirmation                                                                             |
| `apps/api/src/bookings/bookings.service.ts`                         | Passes the requirements to the repository and returns them                                                                                                     |
| `apps/api/src/notifications/templates/booking-confirmation.ts`      | Email lines for the requirements, with the allergy label                                                                                                       |
| `packages/shared/src/bookings.spec.ts`                              | Unit tests for party requirement schema validation                                                                                                             |
| `apps/api/src/bookings/bookings.controller.spec.ts`                 | `POST /api/bookings`: `400` without calling the service for invalid requirements; valid ones reach the service trimmed and without unknown fields              |
| `apps/api/src/bookings/bookings.service.spec.ts`                    | Service unit tests for party requirements orchestration                                                                                                        |
| `apps/api/src/bookings/bookings.repository.spec.ts`                 | Repository unit tests for party requirements persistence                                                                                                       |
| `apps/api/src/notifications/templates/booking-confirmation.spec.ts` | Email template unit tests verifying allergy warnings & HTML                                                                                                    |
| `apps/api/test/integration/confirmation.int-spec.ts`                | Integration tests for DB persistence & email notifications                                                                                                     |
| `apps/api/test/party-requirements.int-spec.ts`                      | Integration tests for party requirements on PostgreSQL                                                                                                         |
| `e2e/tests/api/party-requirements.spec.ts`                          | E2E black-box API tests for party requirements and allergies                                                                                                   |
| `e2e/tests/web/party-requirements.spec.ts`                          | E2E black-box Web UI tests for party requirements booking flow                                                                                                 |
| `apps/web/src/components/RequirementsEditor.test.tsx`               | Component tests for the requirement rows                                                                                                                       |
| `apps/web/src/components/BookingSentDialog.test.tsx`                | Component tests for the dialog, with and without requirements                                                                                                  |
| `apps/web/src/pages/BookingPage.test.tsx`                           | Page tests for the booking flow with requirements                                                                                                              |

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
| `e2e/tests/web/party-requirements.spec.ts`                          | Black-box Web: dynamic UI rows, allergy checkbox, add/remove, confirmation dialog, validation alerts, unauthenticated redirect; accessibility and UX scenarios still skipped as future work                                                                                                                                  |
| `apps/web/src/components/RequirementsEditor.test.tsx`               | No row by default, add and rename the button, edit one row only, remove, keys not reused, text not cut, add disabled at 20 rows                                                                                                                                                                                              |
| `apps/web/src/components/BookingSentDialog.test.tsx`                | No requirements section when empty; requirements in order, allergy label only on the allergy ones                                                                                                                                                                                                                            |
| `apps/web/src/pages/BookingPage.test.tsx`                           | No `requirements` sent by default; every requirement sent with its flag and trimmed; side summary; empty and too long (501) descriptions blocked with an alert, 500 accepted; list in the dialog; rows cleared after closing                                                                                                 |

### Try it manually

1. Start the stack with `docker compose up --build -d`.
2. Log in as a hiker, for example from Swagger at http://localhost:3000/api/docs (`POST /api/auth/login`).
3. Send `POST /api/bookings` with the example body above (use an existing future `slotId` from `GET /api/slots`): the answer lists the 3 requirements.
4. Send a booking with `"requirements": []` or without the field: the answer has `requirements: []`.
5. Open Mailpit at http://localhost:8025: the confirmation email lists the requirements in order, the allergy ones marked `Allergies (special care needed)`.
6. On http://localhost:3000/book (signed in as a hiker), add the 3 requirements of the example, flag the first two as allergies and book: the confirmation dialog lists them in order, the first two marked `Allergies (special care needed)`.
7. Add a row and leave it empty, then book: the alert asks to describe it or remove it and no booking is created.

## Open points

- **Needs of the hut:** the list is a shared constant; letting the warden edit it would need a table and an endpoint.

- **Web app, future scenarios:** keyboard flow, live announcement of the allergy flag, character counter, warning before leaving the page: still skipped in `e2e/tests/web/party-requirements.spec.ts`.
- **MH-06 (change a booking):** the change of a booking must accept the same list (the MH-06 frontend already sends it); `changeBookingSchema` still takes a single text.
- Multiple requirements UI layout optimization for small mobile viewports.
- Kitchen dashboard integration to summarize total allergen counts across all daily bookings.
- **MH-04 Integration:** When merged with story MH-04 (Check availability), unskip availability test suites (`e2e/tests/api/availability.spec.ts`, `e2e/tests/web/availability.spec.ts`) and add end-to-end integration tests validating the user journey from `/availability` checks to booking with party requirements & allergies.
