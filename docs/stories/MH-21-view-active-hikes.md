# MH-21 — View active hikes

|                |                                                                                        |
| -------------- | -------------------------------------------------------------------------------------- |
| **Status**     | Web complete against the check-in contract; check-in API, data model and tests pending |
| **Depends on** | MH-20 (registered hikes, `GET /api/staff/hikes`, `StaffHikesPage`)                     |

## User story

**Business value:** 932

As an employee,  
I want to see all hikers who are currently registered as being on a hike,  
so that I can monitor their expected return times.

### Clarifications

From the story in the course repository:

- Hike information: destination (name), route (a text description, e.g. "via the Chiaretto lake"), intermediate passage points (e.g. "Viso Mozzo").
- No approved clarifications yet.

From the course issues:

- [#53](https://github.com/SE2-Polito/AY26-27-Mountain-Hut/issues/53) (closed): a hike is considered started at its planned departure time; a hiker who does not leave declares the hike finished with MH-22.

Team decisions:

- _Active hike._ A hike is active from its planned departure until its expected return, once a check-in confirmed it has started.
- _Check-in by either side._ The hiker (own hike) or the staff (any hike) can check in; one check-in is enough.
- _Started without check-in._ When the departure has come and nobody checked in, the hike is listed with the active ones and flagged **No check-in**: the staff can call the hiker and check them in.
- _Check-in from the departure on._ The button appears only once the planned departure has come and until the expected return.
- _Past._ From the expected return on, the hike is past, checked in or not.

## Requirements

| #   | Requirement                                                                       | Status                | Implemented in                                                |
| --- | --------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| R1  | Employee and warden see the active hikes                                          | Done (web)            | `StaffHikesPage` (`/staff/hikes`), tab **Active**             |
| R2  | Each hike shows destination, route, passage points, departure and expected return | Done                  | `HikeCard`                                                    |
| R3  | The hiker or the staff check in a started hike                                    | Web done, API pending | `CheckInButton`, `useCheckInHike`, `checkInHike`              |
| R4  | A started hike without check-in is flagged, so the staff can call the hiker       | Done (web)            | `hikeState` (`NO_CHECK_IN`), `HikeCard` badge **No check-in** |

## How it works

- **State on the web.** `hikeState` computes, from hut-local moments: _Planned_ before the departure; _No check-in_ from the departure while `checkedInAt` is empty; _Under way_ from the departure once checked in; _Past_ from the expected return.
- **Contract first.** `RegisteredHike.checkedInAt` is optional: the current API does not send it, so every started hike reads _No check-in_ until the backend lands.

## API (expected, not implemented yet)

### `POST /api/hikes/:id/check-in`

- Roles: `HIKER` (own hike only), `EMPLOYEE`, `WARDEN`.
- Allowed from the planned departure until the expected return; a second check-in keeps the first time.
- `200` with the `RegisteredHike`, `checkedInAt` set (ISO timestamp).
- Errors: `401`, `403` (another hiker's hike), `404` (unknown hike), `409` (hike not started or already past).
- `GET /api/hikes/mine` and `GET /api/staff/hikes` add `checkedInAt` to each hike.

## Web app

### Hikes for the staff (`/staff/hikes`)

Tabs **Active** (default), **Planned**, **Past**, each with its count. **Active** holds the hikes under way and the ones started without a check-in: those without a check-in first, then the soonest expected return. Each card shows destination, state badge, route, passage points, departure, expected return, the check-in time when there is one, and the hiker's contacts. A **Check in** button sits on the cards flagged **No check-in** ("Checking in…" while sending). Success: toast "Check-in recorded: <destination>."; failure: error toast with the API message on `403`, `409`, the session text on `401`, "The check-in could not be recorded. Please try again." otherwise. The list refreshes every minute, and the states are recomputed every 30 seconds (`useNow`), so a hike leaves **Active** at its expected return even without new data. Each card sends its own check-in, so clicks on different cards do not interfere.

### My hikes (`/hikes`)

The hiker's own hike flagged **No check-in** has the same **Check in** button and toasts.

## Code map

| File                                                        | What                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| `packages/shared/src/hikes.ts`                              | `RegisteredHike.checkedInAt`                                   |
| `apps/web/src/api/hikes.ts`, `apps/web/src/api/useHikes.ts` | `checkInHike`, `useCheckInHike` (refreshes my and staff hikes) |
| `apps/web/src/lib/hikeState.ts`                             | `NO_CHECK_IN` state and label                                  |
| `apps/web/src/lib/useNow.ts`                                | Current time refreshed every 30 seconds                        |
| `apps/web/src/components/HikeCard.tsx` (+ `.css`)           | `CheckInButton` (own request, toasts), check-in time, badge    |
| `apps/web/src/pages/StaffHikesPage.tsx`                     | Tab **Active**, ordering, staff check-in                       |
| `apps/web/src/pages/MyHikesPage.tsx`                        | Hiker check-in                                                 |

## Testing

| Spec                                         | Covers                                                            |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `apps/web/src/pages/StaffHikesPage.test.tsx` | MH-20 cases, tab renamed **Active**, under-way fixture checked in |
| `apps/web/src/pages/MyHikesPage.test.tsx`    | MH-20 cases, under-way fixture checked in                         |

No MH-21 specific tests yet.

### Try it manually

1. `docker compose up --build -d`, sign in as an employee, open **Hikes**.
2. A hike whose departure has passed shows in **Active** with **No check-in**.
3. **Check in** shows an error toast until `POST /api/hikes/:id/check-in` exists.

## Open points

- **Backend:** `checked_in_at` column (migration), `CheckInHike` use case, `POST /api/hikes/:id/check-in`, `checkedInAt` in the list endpoints.
- **Tests:** web tests for the check-in and the ordering, API unit, integration and E2E tests.
- **Report to the staff:** the check-in rule and #53 are not in the story's Clarifications.
