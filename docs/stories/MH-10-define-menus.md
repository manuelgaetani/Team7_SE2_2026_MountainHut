# MH-10 — Define menus

|                |                                                                                      |
| -------------- | ------------------------------------------------------------------------------------ |
| **Status**     | Done: API and web app, with the new clarifications                                   |
| **Depends on** | MH-02 (define slot capacity and tables), MH-01 (book a table), MH-05 (dietary needs) |

## User story

As an employee,  
I want to specify the menus for the defined slots,  
so that hikers know when the hut is providing the service.

### Clarifications

- The menu can be a free text, with the option to reuse (and change) previous menus.
- Some basic formatting such as bold, italic, item list (and sub items) should be available.
- Employees can modify a menu only at any time, before the slot where it is used.
- If the same menu is assigned to multiple slots, modifying it should affect only the menu in a specific slot.
- A menu can be deleted for future slots only, for slots in the past the assigned menus remain fixed.

Team assumptions:

- _Before the slot:_ "modify" covers writing a new menu too. From the start of the slot (its date and start time in the hut time zone, `BOOKING_TIMEZONE`) its menu can be neither written, changed nor deleted, so the menus of past slots stay fixed.

- _Structured free text:_ a menu is a list of courses (Antipasti, Primi, Secondi, Dolci by default), each with a few dishes. Each dish has an Italian name, an English name, a price, the marks of what it contains and a free-text description with the formatting of the story.
- _Few dishes:_ a mountain hut serves a few dishes of quality, so a menu has at most 4 courses of at most 4 dishes.
- _Marks:_ the five allergens of the hut (gluten, dairy, egg, nuts, soy) and whether a dish is vegetarian or vegan, with the same line icons as the dietary needs of MH-05, shown without the bar.
- _Who sees it:_ the staff write the menu on the Time slots page; the hikers read it on Book a table, for the slot they choose.
- _Stored as text:_ the API keeps the menu as the free text of the story (a small Markdown subset); the web app writes its courses and dishes into that text in a fixed layout and reads them back (see [Menu text layout](#menu-text-layout)).

## Requirements

| #   | Requirement                                                                                                                        | Status | Implemented in                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| R1  | The staff define or edit the menu of a slot from its card on `/staff/slots`                                                        | Done   | `SlotSchedule` (`MenuAction`), `SlotsPage`                                                                                 |
| R2  | A menu has courses and dishes: Italian name, English name, price, marks, description                                               | Done   | `lib/menu.ts`, `MenuEditor`                                                                                                |
| R3  | Descriptions support bold, italic, list items and sub-items, from a toolbar                                                        | Done   | `MenuTextField`, `lib/menuText.ts`, `MenuText`                                                                             |
| R4  | A previous menu can be reused as the start of a new one, then changed                                                              | Done   | `MenuEditor` ("Start from"), `usePastMenus`                                                                                |
| R5  | Invalid menus are not saved: empty names, price not above 0, description over 280 characters, no dishes, text over 5000 characters | Done   | `menuErrors`, `defineMenuSchema` (web and API)                                                                             |
| R6  | Leaving the editor with unsaved changes asks first                                                                                 | Done   | `MenuEditor`, `ConfirmDialog`                                                                                              |
| R7  | Hikers see the menu of the chosen slot on Book a table, with the marks and a legend                                                | Done   | `SlotMenuCard`, `MenuLegend`, `BookingPage`                                                                                |
| R8  | The menus are stored by the API                                                                                                    | Done   | `MenusController`, `MenusService`, `PrismaMenusRepository`, `api/menus.ts`, `lib/menuFormat.ts`                            |
| R9  | The staff see the menu of a slot as hikers see it, from the time on the slot card                                                  | Done   | `MenuPreviewDialog`, `SlotSchedule`                                                                                        |
| R10 | A menu can be written or changed only before its slot starts                                                                       | Done   | API: `isMenuEditable`, `MenusService.define` (`422`); web: `lib/slotStart.ts`, `SlotSchedule` (**See menu**)               |
| R11 | Changing a menu reused on several slots changes only the menu of that slot                                                         | Done   | One row of `menus` per slot, `MenusService.define`                                                                         |
| R12 | The menu of a future slot can be deleted; the menus of slots that have started stay fixed                                          | Done   | API: `DELETE /api/slots/:id/menu`, `MenusService.remove` (`422`); web: `MenuEditor` (**Delete menu**), `useDeleteSlotMenu` |
| R13 | Removing a course or a dish, discarding changes and deleting a menu ask first, in a popup that blocks the editor                   | Done   | `ConfirmDialog`, `MenuEditor`                                                                                              |

### Decisions

- **One text per menu.** The story asks for a free text with basic formatting, and the API stores exactly that (`text`, 1 to 5000 characters, not trimmed, no NUL). The structured editor of the web app is a way to write that text: `menuToText` writes the courses in a fixed Markdown layout, `textToCourses` reads them back. The API knows nothing of courses, prices or marks.
- **Free texts still shown.** A text that does not follow the layout exactly (for example sent with `curl`) is shown to hikers as formatted free text; the editor cannot open it and says _"This slot's menu is a free text written outside the editor: saving replaces it."_. The "Start from" list skips such texts.
- **Length checked before sending.** Four courses of four dishes with long descriptions can pass 5000 characters: the editor validates the text with the shared `defineMenuSchema` and shows _"The menu can have at most 5000 characters: shorten some descriptions."_ instead of sending it.
- **No menu vs no slot.** `GET /api/slots/:id/menu` answers `404` with two messages: `This slot has no menu` (the web app shows _"The menu of this slot is not out yet."_) and `Slot not found` (shown as an error).
- **Reuse.** Reusing a menu sends its text again, changed or not; `GET /api/menus` lists each different text once, with its latest slot (at most 50).
- **Own copy per slot.** A slot never points to another slot's menu: it keeps its own text. Changing or deleting the menu of one slot never changes the others, even when they show the same text.
- **Only before the slot.** `PUT` and `DELETE` read the start of the slot in the hut time zone and answer `422` from that instant on (`isMenuEditable`: allowed while `now < start`). Reading a menu is always allowed.
- **Delete.** `DELETE /api/slots/:id/menu` removes the menu of a slot that has not started: `204`, then `GET` answers `This slot has no menu`. Deleting a menu that does not exist is a `404`, not a silent success, so the web app knows its view was out of date.
- **Shared messages.** The `404` and `422` messages are in `MENU_ERRORS` (`packages/shared/src/menus.ts`), so the web app and the tests compare the same texts.
- **The start rule in the web app.** `isMenuEditable` in `lib/slotStart.ts` applies the same rule as the API (`now < start`) with the time of the browser, which is the hut's for the staff. It only spares a request the API would refuse: the API stays the one that decides, and its `422` message is shown if a slot starts while the editor is open.
- **Confirmations in a popup.** Removing a course or a dish, discarding changes (on Close, `Escape` or a new "Start from") and deleting the menu ask in a popup above the editor (`ConfirmDialog`). Until it is answered the editor is dimmed and cannot be used (`inert`), so nothing can change behind the question. Guide 08 (section 6) asks for the unsaved-changes prompt inline in the same surface; the team chose the popup for all four questions, so they look and behave the same.
- **Undo kept.** After a confirmed removal the toast with **Undo** still puts the course or dish back.
- **Language.** All UI labels and API messages are in English; dish names are in Italian with an English name.

## How it works

1. The staff open **Define menu** on a slot card: the web app reads `GET /api/slots/:id/menu` and, for "Start from", `GET /api/menus`.
2. On **Save menu**, `menuErrors` checks the fields, `cleanCourses` trims them, `menuToText` writes the text and `defineMenuSchema` checks it.
3. `PUT /api/slots/:id/menu` reads the start of the slot (`404` if it does not exist, `422` if it has started), then upserts the row of the slot in one statement (two writes at once: the last one wins).
4. The web app invalidates the `['menus']` queries: the card shows _"Menu · N courses"_ and hikers see the new menu on Book a table.
5. **Delete menu** asks first, then sends `DELETE /api/slots/:id/menu`, which does the same start check and deletes the row (`404` if the slot had no menu). The web app invalidates the `['menus']` queries again: the card goes back to **Define menu** and the menu leaves the "Start from" list.
6. On a slot that has started, the card shows **See menu** (the preview) instead of **Define menu** or **Edit menu**, or nothing when the slot has no menu.

### Menu text layout

```markdown
## Antipasti

### Tagliere di salumi e formaggi d'alpeggio · € 9.50

_Cured meats and alpine cheeses_
Marks: Gluten, Dairy
Speck, **lardo** and _toma_:

- bread
  - rye

### Canederli in brodo · € 12

_Bread dumplings in broth_
```

One `## ` line per course, then each dish: `### name · € price`, the English name in italics, an optional `Marks:` line with the labels of the legend, then the description. A description line that starts with `#`, `\` or `Marks:` is written with a `\` in front, removed when read.

## Web app

- **Time slots** (`/staff/slots`). Every slot card that has not started has a **Define menu** button, or **Edit menu** with _"Menu · 3 courses"_ once a menu is saved. The button opens the menu editor in a dialog, in the style of Modify booking. From the start of the slot the card shows **See menu** instead (the preview, nothing to change), or no menu button when the slot has no menu.
- **Menu editor** (`MenuEditor`). _Start from_ lists this slot's menu, an empty menu (the four default courses) and every previous menu (_"Sun 22 Nov · 12:00–14:00"_). Each course has a name and its dishes; each dish has _Name (Italian)_, _Name (English)_, _Price (€)_ (a comma is accepted), the marks as toggle tiles and a _Description_ with the toolbar **Bold**, _Italic_, _List item_, _Sub-item_. **Save menu** shows the errors next to the fields, or saves and closes with the toast _"Menu saved for 12:00–14:00."_.
- **Questions** (`ConfirmDialog`). Each opens in a popup above the dimmed editor, with the safe answer first and focused; `Escape`, the × and a click outside give the safe answer:
  - **Remove** a course: _"Remove this course?"_, _"Primi and its 2 dishes will be removed from the menu."_ (**Keep course** / **Remove course**). **Remove dish**: _"Remove this dish?"_, _"Canederli will be removed from Primi."_ (**Keep dish** / **Remove dish**). Once removed, a toast (_"Dish removed: Canederli."_) offers **Undo**, which puts it back in its place.
  - **Close**, `Escape` or a new _Start from_ with changes: _"Discard your changes?"_ (**Keep editing** / **Discard**).
  - **Delete menu** (only when the slot has a menu): _"Delete this menu?"_, _"Hikers will no longer see a menu for 12:00–14:00."_ (**Keep menu** / **Delete menu**). While the request is on its way the popup says _"Deleting menu…"_ and cannot be closed; then the editor closes with the toast _"Menu deleted for 12:00–14:00."_.
- **Preview** (`MenuPreviewDialog`). On `/staff/slots` the time of a slot card (_12:00–14:00_) is a button: it opens a dialog with the menu exactly as hikers see it on Book a table.
- **Table numbers.** Table numbers go from 1 to 50 (`MAX_TABLE_NUMBER` in `lib/slotTables.ts`): a bigger number shows _"Table numbers go from 1 to 50."_ and **Add a table** stops at 50 rows. The API keeps its own limit until the shared schema gets this one.
- **Book a table** (`/book`). Once a time is chosen, the menu of that slot is shown under the form: the courses in two columns, the dish name in Italian with its marks and price, the English name in small italics, the description, and the legend at the bottom. Without a menu: _"The menu of this slot is not out yet."_. A menu written outside the editor is shown as formatted free text, and its slot card says _"Menu · free text"_.

## Data model

| Table   | Change / Role                                 |
| ------- | --------------------------------------------- |
| `menus` | New: the menu of a slot, at most one per slot |

| Column       | Type          | Description                                 |
| ------------ | ------------- | ------------------------------------------- |
| `slot_id`    | `integer` PK  | The slot; `ON DELETE CASCADE`               |
| `text`       | `text`        | The menu as written (layout above, or free) |
| `created_at` | `timestamptz` | First write                                 |
| `updated_at` | `timestamptz` | Last write                                  |

Migrations:

- `20261125170000_slot_menus`

Web types (`lib/menu.ts`):

```ts
type MenuMark = 'GLUTEN' | 'DAIRY' | 'EGG' | 'NUTS' | 'SOY' | 'VEGETARIAN' | 'VEGAN';
interface MenuDish {
  name: string;
  translation: string;
  price: number;
  description: string;
  marks: MenuMark[];
}
interface MenuCourse {
  name: string;
  dishes: MenuDish[];
}
interface SlotMenu {
  slotId: number;
  text: string; // as stored by the API
  courses: MenuCourse[] | null; // null for a free text
  updatedAt: string;
}
interface PastMenu extends SlotMenu {
  date: string;
  startTime: string;
  endTime: string;
}
```

## API

All endpoints need the session cookie. Body schema: `defineMenuSchema` in `packages/shared/src/menus.ts`.

### `PUT /api/slots/:id/menu`

Creates or replaces the menu of a slot that has not started. Employees and warden.

| Field  | Type   | Rules                                                                     |
| ------ | ------ | ------------------------------------------------------------------------- |
| `text` | string | 1 to 5000 characters, at least one visible character, no NUL, not trimmed |

```bash
curl -b cookies.txt -X PUT -H 'Content-Type: application/json' \
  http://localhost:3000/api/slots/12/menu \
  -d '{ "text": "## Primi\n\n### Polenta concia · € 12\n*Polenta with cheese*\nMarks: Dairy" }'
```

Response `200 OK`:

```json
{
  "slotId": 12,
  "text": "## Primi\n\n### Polenta concia · € 12\n*Polenta with cheese*\nMarks: Dairy",
  "updatedAt": "2026-11-26T09:30:00.000Z"
}
```

### `GET /api/slots/:id/menu`

The menu of a slot. Hikers, employees and warden. Same answer as above.

### `DELETE /api/slots/:id/menu`

Deletes the menu of a slot that has not started. Employees and warden. No body.

```bash
curl -b cookies.txt -X DELETE http://localhost:3000/api/slots/12/menu
```

Response `204 No Content`.

### `GET /api/menus`

The menus already written, each different text once with its latest slot, latest slot first, at most 50. Employees and warden.

```json
[
  {
    "slotId": 12,
    "text": "## Primi\n\n### Polenta concia · € 12\n*Polenta with cheese*\nMarks: Dairy",
    "updatedAt": "2026-11-26T09:30:00.000Z",
    "date": "2026-11-28",
    "startTime": "12:00",
    "endTime": "14:00"
  }
]
```

### Errors

| Status | When                                                 | `message`                                                  |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------- |
| `400`  | Body invalid                                         | `Invalid data`                                             |
| `400`  | Id not a number                                      | `Validation failed (numeric string is expected)`           |
| `401`  | No valid session                                     | `Not authenticated`                                        |
| `403`  | A hiker writes or deletes a menu, or lists the menus | `Operation not allowed for your role`                      |
| `404`  | The slot does not exist                              | `Slot not found`                                           |
| `404`  | `GET`, `DELETE`: the slot exists but has no menu     | `This slot has no menu`                                    |
| `422`  | `PUT`: the slot has already started                  | `The slot has already started: its menu cannot be changed` |
| `422`  | `DELETE`: the slot has already started               | `The slot has already started: its menu cannot be deleted` |

The editor shows the API message for `404` and `422` (for example when the slot starts while the editor is open), _"The menu could not be saved. Please try again."_ or _"The menu could not be deleted. Please try again."_ for the rest, and the session notice for `401`.

## Code map

| File                                                           | Role                                                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/shared/src/menus.ts`                                 | `defineMenuSchema`, `SlotMenu`, `PreviousMenu`, length limit, `MENU_ERRORS`                   |
| `apps/api/src/menus/presentation/menus.controller.ts`          | Endpoints, roles, body validation                                                             |
| `apps/api/src/menus/application/menus.service.ts`              | Define, read, delete, list previous; `DomainError` 404s and 422s                              |
| `apps/api/src/menus/domain/menu-policy.ts`                     | `isMenuEditable`: before the start of the slot only                                           |
| `apps/api/src/menus/application/menus.repository.port.ts`      | Repository port                                                                               |
| `apps/api/src/menus/infrastructure/prisma-menus.repository.ts` | Upsert, delete, start of the slot in the hut time zone, distinct texts with their latest slot |
| `apps/api/prisma/schema.prisma` (`Menu`)                       | Table `menus`                                                                                 |
| `apps/web/src/lib/menu.ts`                                     | Types, marks, limits, price format, validation                                                |
| `apps/web/src/lib/menuText.ts`                                 | Parser of the description formatting                                                          |
| `apps/web/src/api/client.ts`                                   | `apiDelete`; a `204` answer is read as nothing                                                |
| `apps/web/src/api/menus.ts`                                    | Requests to the API, 404 "no menu" read as `null`, delete                                     |
| `apps/web/src/lib/menuFormat.ts`                               | Courses written into the menu text and read back                                              |
| `apps/web/src/lib/slotStart.ts`                                | `isMenuEditable`: the start rule in the time of the browser                                   |
| `apps/web/src/api/useMenus.ts`                                 | `useSlotMenu`, `usePastMenus`, `useSaveSlotMenu`, `useDeleteSlotMenu`                         |
| `apps/web/src/components/MenuIcons.tsx`                        | Mark icons, `MenuMarks`, `MenuLegend`                                                         |
| `apps/web/src/components/MenuText.tsx`                         | Formatted description                                                                         |
| `apps/web/src/components/MenuTextField.tsx`                    | Description field with its toolbar                                                            |
| `apps/web/src/components/FormDialog.tsx`                       | Dialog shell of the editor and the preview                                                    |
| `apps/web/src/components/ConfirmDialog.tsx`                    | Popup for a destructive question, above the editor                                            |
| `apps/web/src/components/MenuPreviewDialog.tsx`                | Staff preview of the hiker card                                                               |
| `apps/web/src/components/MenuEditor.tsx`                       | Staff editor, delete                                                                          |
| `apps/web/src/components/SlotMenuCard.tsx`                     | Hiker card on Book a table                                                                    |
| `apps/web/src/components/Menu.css`                             | Styles of the card, the marks and the editor                                                  |

## Testing

```bash
npm run test -w @mountain-hut/shared -- src/menus.spec.ts
npm run test -w @mountain-hut/api -- src/menus src/infrastructure/prisma/prisma-errors.spec.ts
npm run test -w @mountain-hut/web -- src/lib/menu src/lib/slotStart src/components/MenuEditor src/components/ConfirmDialog
npm run test:int -w @mountain-hut/api -- test/menus.int-spec.ts
docker compose up --build -d --wait && npm run test:e2e -- tests/api/menus.spec.ts tests/web/menus.spec.ts
```

| Spec                                                                | Covers                                                                                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/menus.spec.ts`                                 | `defineMenuSchema`: black box (EP, BVA on 5000 characters, wrong types) and white box (NUL, Unicode spaces, issues that fail together)       |
| `apps/api/src/menus/domain/menu-policy.spec.ts`                     | `isMenuEditable` around the start of the slot                                                                                                |
| `apps/api/src/menus/application/menus.service.spec.ts`              | Define, read, delete, previous menus; time zone of the slot start; ISO dates; the `NOT_FOUND` and `UNPROCESSABLE` messages; limit of 50      |
| `apps/api/src/menus/presentation/menus.controller.spec.ts`          | RBAC 403 (hiker on PUT, DELETE and `GET /menus`), 400 body and id without calling the service, 200, 204, 404 and 422 mapping                 |
| `apps/api/src/menus/infrastructure/prisma-menus.repository.spec.ts` | Upsert, delete, start of the slot, P2003 read as `null`, invalid ids without queries, bound `LIMIT`, `DISTINCT ON` and order of the previous |
| `apps/api/src/infrastructure/prisma/prisma-errors.spec.ts`          | `isForeignKeyViolation` (P2003)                                                                                                              |
| `apps/api/test/menus.int-spec.ts`                                   | With PostgreSQL: storage, missing slots, constraints, changes only before the start, delete, concurrent writes, previous menus               |
| `apps/web/src/lib/menu.test.ts`                                     | `menuErrors` (BVA on price and description), `parsePrice`, `formatPrice`, `sortMarks`, `cleanCourses`, labels                                |
| `apps/web/src/lib/menuText.test.ts`                                 | Bold, italic, items, sub-items, unclosed markers, CRLF                                                                                       |
| `apps/web/src/lib/menuFormat.test.ts`                               | Layout of the text, round trip, escapes, CRLF, free texts read as `null`, dish ending on its English name                                    |
| `apps/web/src/lib/slotStart.test.ts`                                | `isMenuEditable` in the browser: one minute before, at the start, after, across the year                                                     |
| `apps/web/src/api/client.test.ts`                                   | `apiDelete` and its `204` answer                                                                                                             |
| `apps/web/src/components/ConfirmDialog.test.tsx`                    | Safe answer focused, Escape/×/backdrop, Escape kept from the dialog below, busy state, page unusable while open                              |
| `apps/web/src/components/MenuEditor.test.tsx`                       | The editor through the page: save, errors, Start from, remove and Undo, the questions, delete, started slots                                 |
| `e2e/tests/api/menus.spec.ts`                                       | RBAC 401/403, write and replace, concurrent writes, max length, 400s, 404s, 422 on started slots, delete, previous menus                     |
| `e2e/tests/web/menus.spec.ts`                                       | Write, format, errors, discard, reuse, preview, free text, delete, slots over or started, the hiker card                                     |

### Try it manually

1. `docker compose up -d db`, `npm run dev:api` and `npm run dev:web`, sign in as an employee, open **Time slots**.
2. On a slot with tables, press **Define menu**. Add a dish, select a word of its description and press **Bold**, then **Save menu**: the toast confirms and the card shows _"Menu · 1 course"_. Reload the page: the menu is still there (stored by the API).
3. On another slot press **Define menu**, in _Start from_ pick the first menu, change a price and save.
4. Sign in as a hiker, open **Book a table**, choose the same day and time: the menu appears under the form.
5. Free text: `curl -b cookies.txt -X PUT -H 'Content-Type: application/json' http://localhost:3000/api/slots/<id>/menu -d '{"text":"- **Polenta**\n  - with cheese"}'`, then open Book a table for that slot: the text is shown formatted; on Time slots the card says _"Menu · free text"_.
6. Questions: in the editor press **Remove** on a course and **Remove dish** on a dish, then change a field and press **Close**: each asks in a popup, and the editor behind it cannot be clicked or reached with `Tab` until you answer.
7. Delete: open **Edit menu** on a future slot, press **Delete menu**, then **Delete menu** in the popup: the toast confirms, the card goes back to **Define menu**, and Book a table says _"The menu of this slot is not out yet."_.
8. Started slot: create a slot that starts in a few minutes and give it a menu. Open its editor and wait for the start, then press **Save menu**: the editor shows _"The slot has already started: its menu cannot be changed"_. Reload: the card shows only **See menu**. A day in the past shows **See menu** on the slots with a menu and no menu button on the others.
9. API: the same `PUT` or `DELETE` with `curl` on a slot of yesterday answers `422` and its menu stays as it was.

## Open points

- No example menus in the API seed: "Start from" lists only the menus written so far.
- **A slot that starts while the page is open** keeps its **Edit menu** button until the page renders again; a save or delete then gets the API's `422` message in the editor.
- **Guide 08, section 6** asks for the unsaved-changes prompt inline; this story uses the popup (see Decisions). The guide may need a line about it.
