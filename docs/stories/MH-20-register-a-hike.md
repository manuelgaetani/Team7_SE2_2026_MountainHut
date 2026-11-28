# MH-20 — Register a hike

|                |                                                                          |
| -------------- | ------------------------------------------------------------------------ |
| **Status**     | API and web complete; unit, integration, web and E2E tests done          |
| **Depends on** | MH-58 (authentication and `RolesGuard`), hiker profiles (`hikers` table) |

## User story

**Business value:** 938

As a hiker,  
I want to register my planned hike before departure,  
so that the hut has information that can be used if I do not return as expected.

### Clarifications

From the story in the course repository:

- Hike information should include: destination (name), route (a text description, e.g. "via the Chiaretto lake"), intermediate passage points (possible intermediate points, e.g. "Viso Mozzo").
- In addition to entering the information it is reasonable to let the hiker select from a few predefined or popular hikes.
- When registering the hike it is also required to provide: planned departure date and time, expected return date and time.

From the course issues:

- [#49](https://github.com/SE2-Polito/AY26-27-Mountain-Hut/issues/49) (closed): what a hike holds; predefined hikes are fine "as long as the UX is smooth". Reported in the story.
- [#51](https://github.com/SE2-Polito/AY26-27-Mountain-Hut/issues/51) (closed): departure and return are both mandatory, and the PO agreed that **the expected return must be later than the planned departure**. This last rule is not in the story's Clarifications yet (see Open points).
- [#53](https://github.com/SE2-Polito/AY26-27-Mountain-Hut/issues/53) (closed, filed under MH-21): a hike is considered started at its planned departure time; a hiker who does not leave declares the hike finished with MH-22. Not in the Clarifications of MH-21 yet (see Open points).

Team assumptions:

- _Route required, passage points optional._ The clarification calls the passage points "possible", so a hike may have none; destination and route are required.
- _"Before departure"._ A hike can be registered only while its departure is still in the future (hut local time).
- _One hike at a time._ A hiker cannot have two hikes whose periods overlap: it would make the monitoring of MH-21/MH-24 ambiguous. Hikes that only touch (one returns when the next departs) are allowed.
- _Predefined hikes fill the form._ Choosing one copies destination, route and passage points into the form; the hiker can change them, and the registered values are the ones sent. The hike keeps a link to the predefined hike it started from.
- _No cancel here._ Following #53, cancelling or finishing a hike belongs to MH-22.

## Requirements

| #   | Requirement                                                                                     | Status | Implemented in                                                                 |
| --- | ----------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| R1  | Only a logged-in `HIKER` with a hiker profile registers a hike (`401` / `403` otherwise)        | Done   | `HikesController` (`@Roles('HIKER')`), `RegisterHike.execute`                  |
| R2  | A hike has a destination and a route (required) and up to 10 passage points (optional, ordered) | Done   | `registerHikeSchema`, `hikes` table                                            |
| R3  | Planned departure and expected return date and time are required                                | Done   | `registerHikeSchema`                                                           |
| R4  | The expected return is after the planned departure (`400`, and a CHECK in the database)         | Done   | `registerHikeSchema`, `hikes_time_range_check`                                 |
| R5  | The planned departure is in the future, in the hut's time zone (`422`)                          | Done   | `decideHikeRegistration`, `localMoment`, `RegisterHike.execute`                |
| R6  | A hike cannot overlap another hike of the same hiker (`409`)                                    | Done   | `HikesRepository.lockHiker`, `findOverlapping`, `RegisterHike`                 |
| R7  | The hiker can list the hut's predefined hikes to start from one                                 | Done   | `GET /api/hikes/predefined`, `ListPredefinedHikes`, `seed.ts`                  |
| R8  | A registration may name the predefined hike it started from (`404` if it does not exist)        | Done   | `registerHikeSchema.predefinedHikeId`, `RegisterHike.execute`                  |
| R9  | Web app: the hiker registers a hike from a form, optionally starting from a predefined hike     | Done   | `RegisterHikePage` (`/hikes/new`), `useRegisterHike`                           |
| R10 | The hiker sees their registered hikes in the personal area (team addition)                      | Done   | `GET /api/hikes/mine`, `ListMyHikes`, `MyHikesPage` (`/hikes`)                 |
| R11 | The staff see every registered hike with the hiker's contacts (team addition, ahead of MH-21)   | Done   | `GET /api/staff/hikes`, `ListHikesForStaff`, `StaffHikesPage` (`/staff/hikes`) |

### Decisions

- **Endpoints.** `POST /api/hikes` registers a hike; `GET /api/hikes/predefined` lists the hut's hikes; `GET /api/hikes/mine` lists the hiker's own hikes. These are for hikers only. `GET /api/staff/hikes` (employee and warden) lists every hike with its hiker: a first read-only view for the staff, before the monitoring of MH-21.
- **Hike state on the web.** A hike is _Planned_ before its departure, _Under way_ from the departure (issue #53) to the expected return, _Past_ from then on. It is computed in the browser from the hut-local moments; no state is stored yet (MH-22 will add the finished hikes).
- **Dates and times.** Like the slots, departure and return are the hut's local date and time, sent as `YYYY-MM-DD` + `HH:MM` and stored as `TIMESTAMP` without time zone. "Now" is converted to the hut's time zone (`BOOKING_TIMEZONE`, default `Europe/Rome`) before the comparison, so a departure is in the future when it is in the future at the hut.
- **Departure in the current minute.** Already come: the departure must be strictly after the current local minute.
- **Status codes.** `400` for an invalid body (including a return not after the departure, which does not depend on the clock); `422` for a departure already come (depends on the clock); `409` for an overlap; `404` for an unknown predefined hike; `403` for a user without a hiker profile.
- **Concurrency.** The registration runs in one transaction and locks the hiker's row (`SELECT ... FOR UPDATE`) before the overlap check, so two registrations of the same hiker run one after the other: of two identical requests sent together, one gets `201` and the other `409`.
- **Predefined hikes are reference data.** They live in their own table (`predefined_hikes`, unique by destination and route), filled by the seed. Deleting one leaves the hikes that started from it, with the link set to `null`.
- **Text.** Destination, route and passage points are trimmed; empty strings are refused. Limits: destination 100, route 500, passage point 100 characters, 10 passage points.
- **Language.** All API messages are in English.

## How it works

1. `POST /api/hikes` arrives with the session cookie. `AuthGuard` checks the session, `RolesGuard` the `HIKER` role, `ZodValidationPipe(registerHikeSchema)` the body (required fields, lengths, return after departure).
2. `RegisterHike.execute` computes the hut's local time now (`localMoment`) and refuses a departure that has already come (`422`).
3. In one transaction it:
   1. finds the hiker profile of the user (`403` if none);
   2. checks the predefined hike, if one is named (`404`);
   3. locks the hiker's row;
   4. looks for a hike of the same hiker that overlaps the new one (`409`, naming it);
   5. saves the hike.
4. The answer is `201` with the registered hike.

## API

### `GET /api/hikes/predefined`

Hikers only. The hut's list of hikes, by destination and route.

```bash
curl -b cookies.txt http://localhost:3000/api/hikes/predefined
```

Response `200 OK`:

```json
[
  {
    "id": 2,
    "destination": "Monte Vettore",
    "route": "From Forca di Presta via Rifugio Zilioli",
    "passagePoints": ["Forca di Presta", "Rifugio Tito Zilioli"]
  }
]
```

### `POST /api/hikes`

Hikers only. The hiker comes from the session, never from the body.

| Field              | Type     | Rules                                                                        |
| ------------------ | -------- | ---------------------------------------------------------------------------- |
| `destination`      | string   | Required, trimmed, 1–100 characters                                          |
| `route`            | string   | Required, trimmed, 1–500 characters                                          |
| `passagePoints`    | string[] | Optional (default `[]`), at most 10, each trimmed, 1–100 characters, ordered |
| `departureDate`    | string   | `YYYY-MM-DD`, valid calendar date, hut local time                            |
| `departureTime`    | string   | `HH:MM`, hut local time; departure must be in the future                     |
| `returnDate`       | string   | `YYYY-MM-DD`, valid calendar date                                            |
| `returnTime`       | string   | `HH:MM`; return must be after the departure                                  |
| `predefinedHikeId` | integer  | Optional: the predefined hike the form started from                          |

```bash
curl -b cookies.txt -H 'Content-Type: application/json' \
  http://localhost:3000/api/hikes \
  -d '{"destination":"Monte Vettore","route":"From Forca di Presta",
       "passagePoints":["Forca di Presta","Rifugio Tito Zilioli"],
       "departureDate":"2035-06-01","departureTime":"08:00",
       "returnDate":"2035-06-01","returnTime":"17:00","predefinedHikeId":2}'
```

Response `201 Created`:

```json
{
  "id": 1,
  "destination": "Monte Vettore",
  "route": "From Forca di Presta",
  "passagePoints": ["Forca di Presta", "Rifugio Tito Zilioli"],
  "departureDate": "2035-06-01",
  "departureTime": "08:00",
  "returnDate": "2035-06-01",
  "returnTime": "17:00",
  "predefinedHikeId": 2
}
```

### `GET /api/hikes/mine`

Hikers only. The hikes of the logged-in hiker, the latest departure first, in the shape of `POST /api/hikes`'s answer.

```bash
curl -b cookies.txt http://localhost:3000/api/hikes/mine
```

`200 OK` with an array of registered hikes (empty if none); `403` `A hiker profile is required to see your hikes` for a user without a hiker profile.

### `GET /api/staff/hikes`

Employee and warden only. Every registered hike with its hiker, the latest departure first. `email` is `null` for a temporary hiker (no account); `phone` and `emergencyContact` may be `null`.

```json
[
  {
    "id": 1,
    "destination": "Monte Vettore",
    "route": "From Forca di Presta",
    "passagePoints": ["Forca di Presta"],
    "departureDate": "2035-06-01",
    "departureTime": "08:00",
    "returnDate": "2035-06-01",
    "returnTime": "17:00",
    "predefinedHikeId": 2,
    "hiker": {
      "id": 5,
      "fullName": "Mario Rossi",
      "email": "hiker@mountainhut.com",
      "phone": "+39 333 1234567",
      "emergencyContact": null
    }
  }
]
```

`403` `Operation not allowed for your role` for a hiker.

### Errors

| Status | When                                                    | `message`                                                                             |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `400`  | Body invalid, or return not after the departure         | `Invalid data` (with `issues`)                                                        |
| `401`  | No active session cookie                                | `Not authenticated`                                                                   |
| `403`  | Role is not `HIKER`                                     | `Operation not allowed for your role`                                                 |
| `403`  | The user has no hiker profile                           | `A hiker profile is required to register a hike`                                      |
| `404`  | `predefinedHikeId` does not exist                       | `Predefined hike not found`                                                           |
| `409`  | The hike overlaps another hike of the same hiker        | `This hike overlaps your hike to Monte Vettore (2035-06-01 08:00 – 2035-06-01 17:00)` |
| `422`  | The planned departure has already come (hut local time) | `The planned departure must be in the future`                                         |

## Web app

| Route          | Page               | Who                                                                         |
| -------------- | ------------------ | --------------------------------------------------------------------------- |
| `/hikes/new`   | `RegisterHikePage` | Hikers. NavBar link **Register a hike** (hiker links, after Availability)   |
| `/hikes`       | `MyHikesPage`      | Hikers, in the personal area: side menu and account menu **My hikes**       |
| `/staff/hikes` | `StaffHikesPage`   | Employee and warden. NavBar link **Hikes** (staff links, after New booking) |

Access (`guides/08-ui-conventions.md`, section 7): `Loading…` while the session loads; a visitor reads "Sign in to register a hike." (the link returns to `/hikes/new`); a staff account reads "Staff accounts cannot register a hike." and the predefined hikes are not requested.

The page, under the hut hero, has the form on the left and a recap on the right:

1. **Start from a popular hike** (`GET /api/hikes/predefined`): one tile per hike (`aria-pressed`). Choosing one copies destination, route and passage points into the form and remembers its id (`predefinedHikeId`); the hiker can still edit everything. **Start from scratch** empties those fields and forgets the id. The section is hidden when the list is empty; if it cannot be loaded an `ErrorNotice` is shown and the form still works.
2. **Where you are going**: destination (`FormField`), route (textarea) and the passage points (`PassagePointsEditor`: numbered rows, **Add a passage point** / **Remove**, disabled at 10; a removal shows a "Passage point removed." toast with **Undo**, which puts the row back in its place, as for the requirements of a booking).
3. **When**: departure and expected return, each a `DateField` (from today; the return from the departure day) plus a `TimeField`. Choosing the departure date also sets the return date when it is empty or earlier.
4. **Your hike** recap: the values as they are typed, the passage points as `A → B`, the time away ("1 day 4 h"), and the **Register the hike** button (`Registering…` while pending).

Validation is inline, before any request: `registerHikeSchema.safeParse` with a message per field ("Enter the destination of the hike.", "Choose the departure date.", "The expected return must be after the planned departure.", "Enter the name of the place, or remove this passage point."), plus a departure already come in the browser's clock ("The planned departure must be in the future."); the hut still checks it in its own time zone (`422`). Times typed as `800` or `8.30` are normalised to `HH:MM`.

Feedback: success shows a toast ("Hike registered: Monte Vettore, Friday 27 November 2026 at 08:00.") with a **View my hikes** action leading to `/hikes`, and empties the form. Errors go to an `ErrorNotice` above the button: the API message for `403`, `404`, `409` (overlap) and `422`; the session-expired text with a "sign in" link on `401`; "The hike could not be registered. Please try again." otherwise.

### My hikes (`/hikes`)

In the personal area (`ProfileLayout`), like My bookings: a visitor is sent to `/unauthorized`; a staff account reads "Staff accounts have no hikes." and nothing is requested. Tabs **Upcoming** (planned and under way, the soonest first) and **Past** (the latest first). Each hike is a `HikeCard`: departure day, destination, state badge (_Planned_, _Under way_, _Past_), route, passage points, departure and expected return. Empty: "You have no upcoming hikes." with a **Register a hike** link; the same link sits next to the title. Errors: `ErrorNotice` with the API message on `403`, the session text on `401`, "Your hikes could not be loaded. Please try again." otherwise.

### Hikes for the staff (`/staff/hikes`)

Staff hero like New booking. Access: "Sign in with a staff account to see the hikes." for a visitor, "This page is for the hut staff." for a hiker (the hikes are not requested). Tabs **Under way** (default), **Planned**, **Past**, each with its count; a **Search** field filters by hiker, destination, route or passage point ("No hike matches the search."). Each `HikeCard` adds the hiker's name, phone (`tel:` link), email (`mailto:` link) and emergency contact, with `—` when missing. The list is refreshed every minute while the page is open.

## Data model

| Table              | Change / Role                       |
| ------------------ | ----------------------------------- |
| `predefined_hikes` | New: the hut's list of hikes        |
| `hikes`            | New: hikes registered by the hikers |

`predefined_hikes`:

| Column           | Type   | Notes                             |
| ---------------- | ------ | --------------------------------- |
| `id`             | SERIAL | Primary key                       |
| `destination`    | TEXT   | Unique with `route`               |
| `route`          | TEXT   |                                   |
| `passage_points` | TEXT[] | Not null, default empty, in order |

`hikes`:

| Column               | Type           | Notes                                                        |
| -------------------- | -------------- | ------------------------------------------------------------ |
| `id`                 | SERIAL         | Primary key                                                  |
| `hiker_id`           | INTEGER        | `hikers.id`, on delete cascade; indexed with `departure_at`  |
| `predefined_hike_id` | INTEGER        | `predefined_hikes.id`, nullable, on delete set null; indexed |
| `destination`        | TEXT           |                                                              |
| `route`              | TEXT           |                                                              |
| `passage_points`     | TEXT[]         | Not null, default empty, in order                            |
| `departure_at`       | TIMESTAMP(0)   | Hut local time                                               |
| `return_at`          | TIMESTAMP(0)   | Hut local time; CHECK `return_at > departure_at`             |
| `created_at`         | TIMESTAMPTZ(3) | Default now                                                  |

Migrations:

- `20261125120000_register_a_hike`

## Configuration

No new variables. The hut's time zone is `BOOKING_TIMEZONE` (default `Europe/Rome`), already used by the bookings.

## Code map

| Path                                                            | Content                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `docs/stories/MH-20-register-a-hike.md`                         | This document                                                                                                            |
| `packages/shared/src/hikes.ts`                                  | `registerHikeSchema`, limits, `hikeMoment`, `PredefinedHike`, `RegisteredHike`, `HikeHiker`, `StaffHike`                 |
| `apps/api/prisma/schema.prisma`                                 | `PredefinedHike` and `Hike` models                                                                                       |
| `apps/api/prisma/migrations/20261125120000_register_a_hike/`    | Tables, indexes, foreign keys and the time range CHECK                                                                   |
| `apps/api/src/seed.ts`                                          | Four predefined hikes around Monte Vettore (upserted)                                                                    |
| `apps/api/src/hikes/hikes.module.ts`                            | Module wiring, registered in `app.module.ts`                                                                             |
| `apps/api/src/hikes/domain/hike.ts`                             | `Hike`, `NewHike`, `LocalMoment`                                                                                         |
| `apps/api/src/hikes/domain/hike-registration-policy.ts`         | `localMoment`, `decideHikeRegistration`                                                                                  |
| `apps/api/src/hikes/application/hikes.repository.port.ts`       | Storage port                                                                                                             |
| `apps/api/src/hikes/application/register-hike.ts`               | `RegisterHike`: checks, lock and save in one transaction                                                                 |
| `apps/api/src/hikes/application/list-predefined-hikes.ts`       | `ListPredefinedHikes`                                                                                                    |
| `apps/api/src/hikes/application/list-my-hikes.ts`               | `ListMyHikes` (hiker's own hikes, `403` without a profile)                                                               |
| `apps/api/src/hikes/application/list-hikes-for-staff.ts`        | `ListHikesForStaff` (every hike with its hiker)                                                                          |
| `apps/api/src/hikes/application/to-registered-hike.ts`          | Stored hike → API shape (date and time split)                                                                            |
| `apps/api/src/hikes/infrastructure/prisma-hikes.repository.ts`  | Prisma queries, hiker row lock, local time mapping                                                                       |
| `apps/api/src/hikes/presentation/hikes.controller.ts`           | `GET /api/hikes/predefined`, `GET /api/hikes/mine`, `POST /api/hikes`, hikers only                                       |
| `apps/api/src/hikes/presentation/staff-hikes.controller.ts`     | `GET /api/staff/hikes`, employee and warden                                                                              |
| `apps/web/src/api/hikes.ts`, `apps/web/src/api/useHikes.ts`     | Fetch functions, `usePredefinedHikes`, `useMyHikes`, `useStaffHikes`, `useRegisterHike`                                  |
| `apps/web/src/pages/RegisterHikePage.tsx` (+ `.css`)            | The page: access, predefined hikes, form, validation, recap                                                              |
| `apps/web/src/components/PassagePointsEditor.tsx`               | Ordered passage points, add and remove, errors per row                                                                   |
| `apps/web/src/pages/MyHikesPage.tsx` (+ `.css`)                 | My hikes in the personal area                                                                                            |
| `apps/web/src/pages/StaffHikesPage.tsx` (+ `.css`)              | Hikes for the staff: tabs, counts, search                                                                                |
| `apps/web/src/components/HikeCard.tsx` (+ `.css`)               | One hike, optionally with the hiker's contacts                                                                           |
| `apps/web/src/lib/hikeState.ts`                                 | `hikeState` (Planned / Under way / Past), `nowMoment`                                                                    |
| `apps/web/src/components/ProfileLayout.tsx`                     | Side menu link **My hikes**                                                                                              |
| `apps/web/src/router.tsx`, `apps/web/src/components/NavBar.tsx` | Routes `/hikes/new`, `/hikes`, `/staff/hikes`; links **Register a hike**, **My hikes** (account menu), **Hikes** (staff) |

## Testing

| Spec                                                                | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/pages/RegisterHikePage.test.tsx`                      | R9: visitor, staff, hiker; predefined hikes (fill, start from scratch, empty, load error); inline validation (required, spaces, return after departure, past departure and +1 minute boundary, empty passage point, 10 points, remove, undo toast; destination, route and passage point at and one over their limits; the return date following a later departure or kept when later); passage points typed, trimmed and edited, focus on the new row; recap **Away for** (minutes, whole hours, one day, plural days, hidden while incomplete or not after the departure); payload with and without `predefinedHikeId`; success toast, reset and **View my hikes**; `409`, `422`, `401`, `500` |
| `apps/web/src/lib/hikeState.test.ts`                                | R10, R11: `nowMoment` (padding, midnight, seconds dropped); `hikeState` boundaries: one minute before the departure, exactly at the departure (issue #53), one minute before and exactly at the expected return, overnight hikes, across the end of the year; state labels                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `apps/api/test/hikes.int-spec.ts`                                   | R1–R8, R10, R11 against PostgreSQL (my hikes and staff list added, not run yet): storage and order of passage points, hut-local time (summer/winter), no hiker profile, departure before now (+1 minute boundary), overlaps and touching hikes, predefined hikes (list, link, unknown, deleted), CHECK/FK/cascade/unique, concurrent registrations and row lock                                                                                                                                                                                                                                                                                                                                 |
| `apps/web/src/components/NavBar.test.tsx`                           | Hiker links include **Register a hike**, account menu **My hikes**; staff links include **Hikes**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `apps/web/src/pages/MyHikesPage.test.tsx`                           | R10: visitor, staff, loading; upcoming (soonest first) and past tabs, states and the return boundary; details; empty; `403`, `401`, `500`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `apps/web/src/pages/StaffHikesPage.test.tsx`                        | R11: visitor, hiker, employee and warden; hiker contacts and dashes; counts per tab and order; search; empty; loading; `401`, `500`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `apps/web/src/pages/ProfilePage.test.tsx`                           | Side menu link **My hikes** for hikers, not for staff                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `apps/api/src/hikes/application/list-my-hikes.spec.ts`              | R10: mapping, order, empty, `403` without a profile                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `apps/api/src/hikes/application/list-hikes-for-staff.spec.ts`       | R11: mapping with the hiker, temporary hiker, empty                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `apps/api/src/hikes/presentation/staff-hikes.controller.spec.ts`    | R11: guards, `200` for employee and warden, `403` for a hiker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `packages/shared/src/hikes.spec.ts`                                 | R2–R4, R8: `hikeMoment`; required fields, trimming, spaces only, NUL character; limits 100/500/100 and 10 passage points (boundary values); date and time formats, impossible and leap dates; return after departure (same minute, ±1 minute, earlier day, across the year); `predefinedHikeId` bounds                                                                                                                                                                                                                                                                                                                                                                                          |
| `apps/api/src/hikes/domain/hike-registration-policy.spec.ts`        | R5: `localMoment` in Rome winter/summer, local day and year change, midnight, seconds dropped, switch to summer time, other zones, unknown zone; `decideHikeRegistration` with the current minute and ±1 minute                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `apps/api/src/hikes/application/register-hike.spec.ts`              | R1, R5, R6, R8: saved hike and answer; `403` without a profile; `422` for a departure come (hut clock, configured zone) before any query; predefined hike link, edited values, `404`; overlap query and `409` message. White box: one unit of work, lock before the overlap check, order of the checks, failure propagation                                                                                                                                                                                                                                                                                                                                                                     |
| `apps/api/src/hikes/application/list-predefined-hikes.spec.ts`      | R7: the hut list, empty list; `toRegisteredHike` date and time split                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `apps/api/src/hikes/presentation/hikes.controller.spec.ts`          | R1, R7, R10: guards; `POST /hikes` `201` with the session user and the current time, parsed body, hiker in the body ignored; `403` for employee and warden; `400` for invalid bodies (with `issues`); `403`/`404`/`409`/`422` mapping; `GET /hikes/predefined` and `GET /hikes/mine` `200` and `403`                                                                                                                                                                                                                                                                                                                                                                                            |
| `apps/api/src/hikes/infrastructure/prisma-hikes.repository.spec.ts` | White box of the Prisma queries: hiker by user, `SELECT ... FOR UPDATE` with a bound id, strict overlap condition, predefined hike count, local time stored as UTC wall clock (winter and summer), hikes of a hiker and staff list order, temporary hiker without email, invalid ids without queries                                                                                                                                                                                                                                                                                                                                                                                            |

E2E tests (Playwright, against the running stack):

| Spec                          | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/tests/api/hikes.spec.ts` | R1–R8, R10, R11 over HTTP: `401` on every endpoint; `403` for the staff, for a hiker on the staff list and without a hiker profile; `201` and its shape, trimmed text, ordered and optional passage points, several days; 15 invalid bodies (`400` with `issues`, nothing stored), hiker in the body ignored; `422` for a departure come; `409` message, touching hikes, the same plan of two hikers, two identical registrations together (`201` + `409`); predefined hikes listed, linked with changes, `404`; my hikes order; staff list with the hiker's contacts for employee and warden |
| `e2e/tests/web/hikes.spec.ts` | R9–R11 in the browser (time zone of the hut): visitor and staff on `/hikes/new`; a hike registered from scratch (passage points, recap, toast, empty form, **View my hikes** and its card); a popular hike chosen, **Start from scratch**, then changed; inline errors with nothing stored; the overlap message; a past hike under **Past** and the empty **Upcoming** tab; staff without hikes; staff page **Planned**, search and the hiker's contacts; a hiker kept out of the staff page                                                                                                  |

The E2E tests add their own predefined hikes and write past hikes straight in the database (`createPredefinedHike`, `insertHike` in `e2e/fixtures/db.ts`), so they do not depend on the seed. They leave out the _Under way_ state, which MH-21 changes.

```bash
docker compose up --build -d --wait && npm run test:e2e -- tests/api/hikes.spec.ts tests/web/hikes.spec.ts
```

### Try it manually

1. Start the stack and seed the demo data: `docker compose up --build -d`, then `npm run prisma:seed -w @mountain-hut/api`.
2. Sign in as the demo hiker: `curl -c cookies.txt -H 'Content-Type: application/json' http://localhost:3000/api/auth/login -d '{"email":"hiker@mountainhut.com","password":"Password123!"}'`.
3. `GET /api/hikes/predefined` returns the four hikes of the seed.
4. Register a hike in the future with the `POST /api/hikes` example above: `201`. Send it again: `409`.
5. Send a departure earlier today: `422`. Send a return before the departure: `400`.
6. In the browser, sign in as the hiker and open **Register a hike**: pick **Monte Vettore**, choose tomorrow 08:00 – 17:00, press **Register the hike**: a toast confirms it; **View my hikes** opens the personal area with the hike under Upcoming. Register it again: the overlap message appears above the button.
7. Sign in as an employee and open **Hikes**: the hike is under Planned with the hiker's contacts; search by the hiker's name.
8. Inspect the rows: `docker compose exec db psql -U mountainhut -d mountainhut -c 'select * from hikes'`.

Checked by hand on 2026-11-25 against a throwaway database: the migration matches `schema.prisma` (`prisma migrate diff`: no difference), the seed is idempotent, every status in the error table, the time zone boundary (a departure one minute ago in Rome, still future in UTC, gets `422`) and two identical concurrent registrations (`201` and `409`).

## Open points

- **Report to the staff:** the decision of [#51](https://github.com/SE2-Polito/AY26-27-Mountain-Hut/issues/51) that the return must be after the departure is not in the Clarifications of MH-20.
- **Report to the staff:** the decision of [#53](https://github.com/SE2-Polito/AY26-27-Mountain-Hut/issues/53) (a hike starts at its departure time; not leaving is handled by MH-22) is not in the Clarifications of MH-21, which still says "No approved clarifications yet".
- **Predefined hikes only from the seed.** An installation without demo data has an empty list; the staff cannot manage the list yet. To decide whether to load the list in a migration or add a staff page.
- **MH-22.** When a hike can be declared finished, decide whether a finished hike still blocks an overlapping registration (today every hike does).
- **Tests.** The integration cases for my hikes and the staff list were not run yet. The `TODO(MH-20-e2e)` comments in the unit specs can go: the E2E tests are in `e2e/tests/{api,web}/hikes.spec.ts`.
- **MH-21.** The staff page is read-only; overdue alerts and the monitoring of MH-21/MH-24 will build on it.
- **Time zone on the web.** The page checks the departure with the browser clock; a hiker in another time zone may pass it and get the hut's `422`, shown above the button.
