# MH-10 — Define menus

|                |                                                                                      |
| -------------- | ------------------------------------------------------------------------------------ |
| **Status**     | In progress: web app done on a local store; API and tests to come                    |
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

## Requirements

| #   | Requirement                                                                                             | Status     | Implemented in                                     |
| --- | ------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------- |
| R1  | The staff define or edit the menu of a slot from its card on `/staff/slots`                             | Done (web) | `SlotSchedule` (`MenuAction`), `SlotsPage`         |
| R2  | A menu has courses and dishes: Italian name, English name, price, marks, description                    | Done (web) | `lib/menu.ts`, `MenuEditor`                        |
| R3  | Descriptions support bold, italic, list items and sub-items, from a toolbar                             | Done (web) | `MenuTextField`, `lib/menuText.ts`, `MenuText`     |
| R4  | A previous menu can be reused as the start of a new one, then changed                                   | Done (web) | `MenuEditor` ("Start from"), `usePastMenus`        |
| R5  | Invalid menus are not saved: empty names, price not above 0, description over 280 characters, no dishes | Done (web) | `menuErrors`                                       |
| R6  | Leaving the editor with unsaved changes asks first                                                      | Done (web) | `MenuEditor`, `SlotsPage` (`guard`)                |
| R7  | Hikers see the menu of the chosen slot on Book a table, with the marks and a legend                     | Done (web) | `SlotMenuCard`, `MenuLegend`, `BookingPage`        |
| R8  | The menus are stored by the API                                                                         | To do      | `api/menus.ts` keeps them in the browser until now |

## Web app

- **Time slots** (`/staff/slots`). Every slot card has a **Define menu** button, or **Edit menu** with _"Menu · 3 courses"_ once a menu is saved. The button opens the menu editor in the side panel, where the new slot form and the tables form are.
- **Menu editor** (`MenuEditor`). _Start from_ lists this slot's menu, an empty menu (the four default courses) and every previous menu (_"Sun 22 Nov · 12:00–14:00"_). Each course has a name and its dishes; each dish has _Name (Italian)_, _Name (English)_, _Price (€)_ (a comma is accepted), the marks as toggle tiles and a _Description_ with the toolbar **Bold**, _Italic_, _List item_, _Sub-item_. **Save menu** shows the errors next to the fields, or saves and closes with the toast _"Menu saved for 12:00–14:00."_. **Close** or `Escape` with changes asks _"Discard your changes?"_ (**Keep editing** / **Discard**); so do another day or another slot's button.
- **Book a table** (`/book`). Once a time is chosen, the menu of that slot is shown under the form: the courses in two columns, the dish name in Italian with its marks and price, the English name in small italics, the description, and the legend at the bottom. Without a menu: _"The menu of this slot is not out yet."_.

## Data model (web, until the API)

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
  date: string;
  startTime: string;
  endTime: string;
  courses: MenuCourse[];
  updatedAt: string;
}
```

## API

To be integrated. `api/menus.ts` keeps the shape of the expected requests, so only the bodies of its functions change:

| Function         | Expected request          |
| ---------------- | ------------------------- |
| `fetchSlotMenu`  | `GET /api/slots/:id/menu` |
| `fetchPastMenus` | `GET /api/menus`          |
| `saveSlotMenu`   | `PUT /api/slots/:id/menu` |

Until then the menus live in the browser (`localStorage`, key `mh.menus`), starting from three example menus (`api/menuSeed.ts`).

## Code map

| File                                        | Role                                                       |
| ------------------------------------------- | ---------------------------------------------------------- |
| `apps/web/src/lib/menu.ts`                  | Types, marks, limits, price format, validation             |
| `apps/web/src/lib/menuText.ts`              | Parser of the description formatting                       |
| `apps/web/src/api/menus.ts`                 | Local store of the menus (to be replaced by the API calls) |
| `apps/web/src/api/menuSeed.ts`              | Example menus to reuse                                     |
| `apps/web/src/api/useMenus.ts`              | `useSlotMenu`, `usePastMenus`, `useSaveSlotMenu`           |
| `apps/web/src/components/MenuIcons.tsx`     | Mark icons, `MenuMarks`, `MenuLegend`                      |
| `apps/web/src/components/MenuText.tsx`      | Formatted description                                      |
| `apps/web/src/components/MenuTextField.tsx` | Description field with its toolbar                         |
| `apps/web/src/components/MenuEditor.tsx`    | Staff editor                                               |
| `apps/web/src/components/SlotMenuCard.tsx`  | Hiker card on Book a table                                 |
| `apps/web/src/components/Menu.css`          | Styles of the card, the marks and the editor               |

## Try it manually

1. `npm run dev:api` and `npm run dev:web`, sign in as an employee, open **Time slots**.
2. On a slot with tables, press **Define menu**. In _Start from_ pick a previous menu, change a dish, select a word of its description and press **Bold**, then **Save menu**: the toast confirms and the card shows _"Menu · 4 courses"_.
3. Sign in as a hiker, open **Book a table**, choose the same day and time: the menu appears under the form.
