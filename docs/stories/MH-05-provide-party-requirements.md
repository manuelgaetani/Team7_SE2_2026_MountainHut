# MH-05 — Provide party requirements

|                |                                                                      |
| -------------- | -------------------------------------------------------------------- |
| **Status**     | Backend complete; E2E test suite defined (black-box); web UI pending |
| **Depends on** | MH-01 (bookings domain, book a table), MH-03 (receive confirmation)  |

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

| #   | Requirement                                                                                           | Status      | Implemented in                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| R1  | Hiker can provide a list of dietary requirements and allergies when booking a table                   | In progress | `POST /api/bookings`, `BookingsService.create`, Booking page UI _(pending)_                                      |
| R2  | Each requirement entry contains an allergies flag (`allergies: boolean`) and a description (`string`) | Done        | `partyRequirementSchema`, `PartyRequirement`                                                                     |
| R3  | When allergies are present, the allergies flag indicates that special care is needed during food prep | Done        | `PartyRequirement.allergies`, `bookingConfirmationEmail` (`Allergies (special care needed)`)                     |
| R4  | Multiple requirements can be specified for distinct subsets of the party                              | In progress | `BookingsRepository.createBooking`, `PartyRequirement[]`, dynamic web UI _(pending)_                             |
| R5  | Dietary restrictions without allergies have the allergies flag unset (`allergies: false`)             | Done        | `PartyRequirement` with `allergies: false`                                                                       |
| R6  | Party requirements are optional (a booking can be created with empty or no requirements)              | Done        | `createBookingSchema` optional requirements, `BookingsService.create`                                            |
| R7  | Validation: each provided requirement must have a non-empty description within length limits          | Done        | `createBookingSchema` validation (`min(1)`, `max(500)`, `hasNoNulByte`, `max(20)` items)                         |
| R8  | Requirements and allergy alerts are persisted and reflected in booking confirmations and emails       | In progress | `party_requirements` table, `findBookingConfirmation`, `bookingConfirmationEmail`, summary dialog UI _(pending)_ |

### Decisions

- **Structured requirements array.** Instead of a single unstructured text note, requirements are modeled as a list of objects (`Array<{ allergies: boolean; description: string }>`) to cleanly separate distinct subsets of the party and explicitly track allergies requiring special care.
- **Explicit allergy flag.** The `allergies: boolean` flag acts as an unambiguous safety signal for the hut kitchen. When `true`, special precautions against cross-contamination and allergen safety are highlighted.
- **Free-text description per subset.** Each subset's dietary needs are described in human-readable text (e.g. "1 vegan, peanut allergy", "2 vegetarians") providing flexibility for diverse combinations of diets and allergies.
- **Optional field & backwards compatibility.** Bookings without dietary restrictions can omit `requirements` or pass an empty array `[]`. Existing booking workflows remain fully operational.
- **Input constraints.** Each requirement description must be a non-empty string trimmed of whitespace, with a maximum length of 500 characters, rejecting NUL bytes. A maximum of 20 requirement items per booking is enforced.
- **Language.** All user interface labels, alerts, and API error messages are in English.

## How it works

1. An authenticated hiker selects an available time slot and party size on `/book`.
2. In the "Dietary requirements & allergies" section, the hiker can add one or more requirement items for subsets of their party.
3. For each item:
   - The hiker checks the "Allergies (special care needed)" checkbox if the subset has allergies.
   - The hiker fills in the details in the text field (e.g. "1 vegan, peanut allergy").
   - Additional items can be appended or removed dynamically.
4. When submitting the booking (`POST /api/bookings`):
   - The API validates the payload with `ZodValidationPipe`, ensuring each item has valid boolean `allergies` and valid `description`.
   - The booking transaction creates the booking along with its party requirements.
   - Seat allocation executes per the MH-01 policy.
5. The API responds with `201 Created`, returning the booking summary including the assigned tables and party requirements.
6. The confirmation email sent via SMTP (MH-03) includes the list of party requirements, prominently flagging items requiring allergy precautions with `Allergies (special care needed):`.
7. The web app displays the confirmation dialog confirming the booking request and summarizing the party requirements.

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

| Status | When                                                                                 | `message`                                        |
| ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `400`  | Body is invalid (missing description, invalid types, empty text, NUL bytes, >20 req) | `Invalid data`                                   |
| `401`  | Missing or expired session cookie                                                    | `Unauthorized`                                   |
| `403`  | Authenticated user is not a `HIKER` or lacks hiker profile                           | `A hiker profile is required to book a table`    |
| `404`  | Requested time slot does not exist                                                   | `Slot not found`                                 |
| `409`  | Hiker already has active booking, or insufficient free seats                         | `You already have a booking for this slot`       |
| `422`  | Less than 2 hours before slot start time                                             | `Less than 2 hours remaining before the slot...` |

## Web app

- **Route:** `/book`
- **Party Requirements Controls:**
  - "Add requirement" button to append a new item row.
  - "Allergies" checkbox for each item to flag special care needed.
  - "Details" text field for each item with placeholder (e.g. `e.g. 1 vegan, peanut allergy`).
  - "Remove" button per item to delete unnecessary rows.
- **Booking Dialog & Feedback:**
  - Confirmation dialog displays party requirements list.
  - Allergy items display a distinctive warning badge / label ("Allergies - Special care").
- **Accessibility:**
  - Form fields associate labels with controls via `id`/`htmlFor`.
  - Checkboxes expose explicit accessible names (`aria-label="Allergies (special care needed)"`).

## Data model

The party requirements are persisted in a dedicated relational table:

| Table                | Column        | Type      | Description                                              |
| -------------------- | ------------- | --------- | -------------------------------------------------------- |
| `party_requirements` | `id`          | `SERIAL`  | Primary key                                              |
| `party_requirements` | `booking_id`  | `INTEGER` | Foreign key referencing `bookings(id)` on delete cascade |
| `party_requirements` | `allergies`   | `BOOLEAN` | Whether special care is needed for allergens             |
| `party_requirements` | `description` | `TEXT`    | Dietary / allergy description for the subset             |

Migrations:

- `20261111095430_party_requirements`

## Configuration

No new environment variables required.

## Code map

| Path                                                                | Content                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `docs/stories/MH-05-provide-party-requirements.md`                  | Official living story documentation                            |
| `e2e/tests/api/party-requirements.spec.ts`                          | E2E black-box API tests for party requirements and allergies   |
| `e2e/tests/web/party-requirements.spec.ts`                          | E2E black-box Web UI tests for party requirements booking flow |
| `packages/shared/src/bookings.ts`                                   | Party requirement Zod schema and types                         |
| `packages/shared/src/bookings.spec.ts`                              | Unit tests for party requirement schema validation             |
| `apps/api/prisma/schema.prisma`                                     | PartyRequirement entity and relation to Booking                |
| `apps/api/src/bookings/bookings.repository.ts`                      | Database persistence for party requirements                    |
| `apps/api/src/bookings/bookings.repository.spec.ts`                 | Repository unit tests for party requirements persistence       |
| `apps/api/src/bookings/bookings.service.ts`                         | Booking service logic handling party requirements              |
| `apps/api/src/bookings/bookings.service.spec.ts`                    | Service unit tests for party requirements orchestration        |
| `apps/api/src/notifications/templates/booking-confirmation.ts`      | Email template listing party requirements with allergy alerts  |
| `apps/api/src/notifications/templates/booking-confirmation.spec.ts` | Email template unit tests verifying allergy warnings & HTML    |
| `apps/api/test/integration/confirmation.int-spec.ts`                | Integration tests for DB persistence & email notifications     |
| `apps/web/src/pages/BookingPage.tsx`                                | _(Pending)_ Web booking form party requirements section        |

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

Run end-to-end tests:

```bash
# Run API E2E tests for MH-05
npm run e2e:api -w @mountain-hut/e2e -- e2e/tests/api/party-requirements.spec.ts

# Run Web E2E tests for MH-05
npm run e2e:web -w @mountain-hut/e2e -- e2e/tests/web/party-requirements.spec.ts

# Run entire E2E suite
npm run test:e2e
```

| Spec                                                                | Covers                                                                                                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/bookings.spec.ts`                              | Schema validation: allergies flag, description trimming, NUL byte rejection, max length 500, max count 20                                                                       |
| `apps/api/src/bookings/bookings.service.spec.ts`                    | Service orchestration: stores party requirements, returns requirements array                                                                                                    |
| `apps/api/src/bookings/bookings.repository.spec.ts`                 | Repository persistence: creates party requirements in DB, finds confirmation with requirements                                                                                  |
| `apps/api/src/notifications/templates/booking-confirmation.spec.ts` | Email template: allergy special care warnings, HTML escaping, empty requirements omission                                                                                       |
| `apps/api/test/integration/confirmation.int-spec.ts`                | Integration: DB persistence of party_requirements, confirmation email dispatch                                                                                                  |
| `e2e/tests/api/party-requirements.spec.ts`                          | Black-box API: multiple requirements, allergy flag, empty/omitted requirements, length/count boundaries, whitespace trimming, NUL bytes, HTML escaping in emails, RBAC and auth |
| `e2e/tests/web/party-requirements.spec.ts`                          | Black-box Web: dynamic UI rows, allergy checkbox, add/remove, confirmation dialog, validation alerts, unauthenticated redirect                                                  |

### Try it manually

1. Start stack with `docker compose up --build -d`.
2. Log in as a registered hiker via `http://localhost:3000/login`.
3. Navigate to `http://localhost:3000/book`.
4. Choose an available slot and party size of 4.
5. In the party requirements section, click "Add requirement".
6. Check "Allergies" and type `"1 vegan, peanut allergy"`.
7. Click "Add requirement" again, check "Allergies" and type `"1 shellfish allergy"`.
8. Click "Add requirement" a third time, leave "Allergies" unchecked and type `"2 vegetarians"`.
9. Click "Book your table".
10. Verify confirmation dialog shows all 3 requirements with allergy tags.
11. Inspect Mailpit at `http://localhost:8025` to verify confirmation email content.

## Open points

- Multiple requirements UI layout optimization for small mobile viewports.
- Kitchen dashboard integration to summarize total allergen counts across all daily bookings.
