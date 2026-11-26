# MH-10 — Define menus

|                |                                                                                      |
| -------------- | ------------------------------------------------------------------------------------ |
| **Status**     | API and web app integrated; web and integration tests to come                        |
| **Depends on** | MH-02 (define slot capacity and tables), MH-01 (book a table), MH-05 (dietary needs) |

## User story

As an employee,  
I want to specify the menus for the defined slots,  
so that hikers know when the hut is providing the service.

### Clarifications

- The menu can be a free text, with the option to reuse (and change) previous menus.
- Some basic formatting such as bold, italic, item list (and sub items) should be available.

Team assumptions:

- _Structured free text:_ a menu is a list of courses (Antipasti, Primi, Secondi, Dolci by default), each with a few dishes. Each dish has an Italian name, an English name, a price, the marks of what it contains and a free-text description with the formatting of the story.
- _Few dishes:_ a mountain hut serves a few dishes of quality, so a menu has at most 4 courses of at most 4 dishes.
- _Marks:_ the five allergens of the hut (gluten, dairy, egg, nuts, soy) and whether a dish is vegetarian or vegan, with the same line icons as the dietary needs of MH-05, shown without the bar.
- _Who sees it:_ the staff write the menu on the Time slots page; the hikers read it on Book a table, for the slot they choose.
- _Stored as text:_ the API keeps the menu as the free text of the story (a small Markdown subset); the web app writes its courses and dishes into that text in a fixed layout and reads them back (see [Menu text layout](#menu-text-layout)).

## Requirements

| #   | Requirement                                                                                                                        | Status | Implemented in                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| R1  | The staff define or edit the menu of a slot from its card on `/staff/slots`                                                        | Done   | `SlotSchedule` (`MenuAction`), `SlotsPage`                                                      |
| R2  | A menu has courses and dishes: Italian name, English name, price, marks, description                                               | Done   | `lib/menu.ts`, `MenuEditor`                                                                     |
| R3  | Descriptions support bold, italic, list items and sub-items, from a toolbar                                                        | Done   | `MenuTextField`, `lib/menuText.ts`, `MenuText`                                                  |
| R4  | A previous menu can be reused as the start of a new one, then changed                                                              | Done   | `MenuEditor` ("Start from"), `usePastMenus`                                                     |
| R5  | Invalid menus are not saved: empty names, price not above 0, description over 280 characters, no dishes, text over 5000 characters | Done   | `menuErrors`, `defineMenuSchema` (web and API)                                                  |
| R6  | Leaving the editor with unsaved changes asks first                                                                                 | Done   | `MenuEditor`                                                                                    |
| R7  | Hikers see the menu of the chosen slot on Book a table, with the marks and a legend                                                | Done   | `SlotMenuCard`, `MenuLegend`, `BookingPage`                                                     |
| R9  | The staff see the menu of a slot as hikers see it, from the time on the slot card                                                  | Done   | `MenuPreviewDialog`, `SlotSchedule`                                                             |
| R8  | The menus are stored by the API                                                                                                    | Done   | `MenusController`, `MenusService`, `PrismaMenusRepository`, `api/menus.ts`, `lib/menuFormat.ts` |

### Decisions

- **One text per menu.** The story asks for a free text with basic formatting, and the API stores exactly that (`text`, 1 to 5000 characters, not trimmed, no NUL). The structured editor of the web app is a way to write that text: `menuToText` writes the courses in a fixed Markdown layout, `textToCourses` reads them back. The API knows nothing of courses, prices or marks.
- **Free texts still shown.** A text that does not follow the layout exactly (for example sent with `curl`) is shown to hikers as formatted free text; the editor cannot open it and says _"This slot's menu is a free text written outside the editor: saving replaces it."_. The "Start from" list skips such texts.
- **Length checked before sending.** Four courses of four dishes with long descriptions can pass 5000 characters: the editor validates the text with the shared `defineMenuSchema` and shows _"The menu can have at most 5000 characters: shorten some descriptions."_ instead of sending it.
- **No menu vs no slot.** `GET /api/slots/:id/menu` answers `404` with two messages: `This slot has no menu` (the web app shows _"The menu of this slot is not out yet."_) and `Slot not found` (shown as an error).
- **Reuse.** Reusing a menu sends its text again, changed or not; `GET /api/menus` lists each different text once, with its latest slot (at most 50).
- **Language.** All UI labels and API messages are in English; dish names are in Italian with an English name.

## How it works

1. The staff open **Define menu** on a slot card: the web app reads `GET /api/slots/:id/menu` and, for "Start from", `GET /api/menus`.
2. On **Save menu**, `menuErrors` checks the fields, `cleanCourses` trims them, `menuToText` writes the text and `defineMenuSchema` checks it.
3. `PUT /api/slots/:id/menu` upserts the row of the slot in one statement (two writes at once: the last one wins); a missing slot is a `404`.
4. The web app invalidates the `['menus']` queries: the card shows _"Menu · N courses"_ and hikers see the new menu on Book a table.

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

- **Time slots** (`/staff/slots`). Every slot card has a **Define menu** button, or **Edit menu** with _"Menu · 3 courses"_ once a menu is saved. The button opens the menu editor in a dialog, in the style of Modify booking.
- **Menu editor** (`MenuEditor`). _Start from_ lists this slot's menu, an empty menu (the four default courses) and every previous menu (_"Sun 22 Nov · 12:00–14:00"_). Each course has a name and its dishes; each dish has _Name (Italian)_, _Name (English)_, _Price (€)_ (a comma is accepted), the marks as toggle tiles and a _Description_ with the toolbar **Bold**, _Italic_, _List item_, _Sub-item_. Removing a dish or a course shows a toast (_"Dish removed: Canederli in brodo."_) with **Undo**, which puts it back in its place. **Save menu** shows the errors next to the fields, or saves and closes with the toast _"Menu saved for 12:00–14:00."_. **Close** or `Escape` with changes asks _"Discard your changes?"_ (**Keep editing** / **Discard**).
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

Creates or replaces the menu of a slot. Employees and warden.

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

| Status | When                                     | `message`               |
| ------ | ---------------------------------------- | ----------------------- |
| `400`  | Body invalid, or id not a number         | `Invalid data`          |
| `401`  | No session cookie                        | `Unauthorized`          |
| `403`  | A hiker writes a menu or lists the menus | _(role guard message)_  |
| `404`  | The slot does not exist                  | `Slot not found`        |
| `404`  | `GET`: the slot exists but has no menu   | `This slot has no menu` |

The editor shows the API message for `404`, _"The menu could not be saved. Please try again."_ for the rest, and the session notice for `401`.

## Code map

| File                                                           | Role                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/shared/src/menus.ts`                                 | `defineMenuSchema`, `SlotMenu`, `PreviousMenu`, length limit |
| `apps/api/src/menus/presentation/menus.controller.ts`          | Endpoints, roles, body validation                            |
| `apps/api/src/menus/application/menus.service.ts`              | Define, read, list previous; `DomainError` 404s              |
| `apps/api/src/menus/application/menus.repository.port.ts`      | Repository port                                              |
| `apps/api/src/menus/infrastructure/prisma-menus.repository.ts` | Upsert, distinct texts with their latest slot                |
| `apps/api/prisma/schema.prisma` (`Menu`)                       | Table `menus`                                                |
| `apps/web/src/lib/menu.ts`                                     | Types, marks, limits, price format, validation               |
| `apps/web/src/lib/menuText.ts`                                 | Parser of the description formatting                         |
| `apps/web/src/api/menus.ts`                                    | Requests to the API, 404 "no menu" read as `null`            |
| `apps/web/src/lib/menuFormat.ts`                               | Courses written into the menu text and read back             |
| `apps/web/src/api/useMenus.ts`                                 | `useSlotMenu`, `usePastMenus`, `useSaveSlotMenu`             |
| `apps/web/src/components/MenuIcons.tsx`                        | Mark icons, `MenuMarks`, `MenuLegend`                        |
| `apps/web/src/components/MenuText.tsx`                         | Formatted description                                        |
| `apps/web/src/components/MenuTextField.tsx`                    | Description field with its toolbar                           |
| `apps/web/src/components/MenuDialog.tsx`                       | Dialog shell of the editor and the preview                   |
| `apps/web/src/components/MenuPreviewDialog.tsx`                | Staff preview of the hiker card                              |
| `apps/web/src/components/MenuEditor.tsx`                       | Staff editor                                                 |
| `apps/web/src/components/SlotMenuCard.tsx`                     | Hiker card on Book a table                                   |
| `apps/web/src/components/Menu.css`                             | Styles of the card, the marks and the editor                 |

## Testing

```bash
npm run test -w @mountain-hut/web -- src/lib/menuFormat.test.ts
docker compose up --build -d --wait && npm run test:e2e -- tests/api/menus.spec.ts
```

| Spec                                  | Covers                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/menuFormat.test.ts` | Layout of the text, round trip, escapes, CRLF, free texts read as `null`                   |
| `e2e/tests/api/menus.spec.ts`         | RBAC 401/403, write and replace, concurrent writes, max length, 400s, 404s, previous menus |

### Try it manually

1. `docker compose up -d db`, `npm run dev:api` and `npm run dev:web`, sign in as an employee, open **Time slots**.
2. On a slot with tables, press **Define menu**. Add a dish, select a word of its description and press **Bold**, then **Save menu**: the toast confirms and the card shows _"Menu · 1 course"_. Reload the page: the menu is still there (stored by the API).
3. On another slot press **Define menu**, in _Start from_ pick the first menu, change a price and save.
4. Sign in as a hiker, open **Book a table**, choose the same day and time: the menu appears under the form.
5. Free text: `curl -b cookies.txt -X PUT -H 'Content-Type: application/json' http://localhost:3000/api/slots/<id>/menu -d '{"text":"- **Polenta**\n  - with cheese"}'`, then open Book a table for that slot: the text is shown formatted; on Time slots the card says _"Menu · free text"_.

## Open points

- No example menus in the API seed: "Start from" lists only the menus written so far.
- Web component tests (`MenuEditor`, `SlotMenuCard`, `api/menus.ts`) and integration tests of `PrismaMenusRepository` are handled by other team members (`test/MH-10-*` branches).
