import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SlotDetails } from '@mountain-hut/shared';
import { MENU_ERRORS } from '@mountain-hut/shared';
import { routes } from '../router.tsx';
import { menuToText } from '../lib/menuFormat.ts';
import type { MenuCourse } from '../lib/menu.ts';

// MH-10 (R1-R6, R9): the staff write the menu of a slot from its card on /staff/slots and see it
// as hikers do. The editor is driven through the page, as the staff use it.

const TEXT = {
  define: 'Define the menu of 19:00–21:00',
  edit: 'Edit the menu of 19:00–21:00',
  title: 'Menu for 19:00–21:00',
  loading: 'Loading the menu…',
  loadFailed: 'Could not load the menu. Please try again.',
  startFrom: 'Start from',
  thisMenu: "This slot's menu",
  emptyMenu: 'Empty menu',
  pastMenu: 'Sun 1 Nov · 12:00–14:00',
  reuseHint: 'Pick a previous menu to reuse it, then change what you need.',
  freeTextHint: "This slot's menu is a free text written outside the editor: saving replaces it.",
  name: 'Name (Italian)',
  translation: 'Name (English)',
  price: 'Price (€)',
  description: 'Description',
  addDish: 'Add a dish to Antipasti',
  addCourse: 'Add a course',
  maxCourses: 'At most 4 courses',
  maxDishes: 'At most 4 dishes',
  save: 'Save menu',
  saving: 'Saving menu…',
  close: 'Close',
  discardTitle: 'Discard your changes?',
  keep: 'Keep editing',
  discard: 'Discard',
  undo: 'Undo',
  saved: 'Menu saved for 19:00–21:00.',
  noDish: 'Add at least one dish.',
  fixFields: 'Some fields need a fix: see the messages above.',
  dishName: 'Enter the name of the dish.',
  englishName: 'Enter the English name.',
  priceAboveZero: 'Enter a price above 0, such as 12 or 9.50.',
  priceTooHigh: 'A price can be at most € 999.',
  longDescription: 'A description can be at most 280 characters.',
  courseName: 'Name the course, or remove it.',
  tooLong: 'The menu can have at most 5000 characters: shorten some descriptions.',
  saveFailed: 'The menu could not be saved. Please try again.',
  sessionExpired: 'The session has expired. Please sign in again.',
  preview: 'As hikers see it',
  notOut: 'The menu of this slot is not out yet.',
  seeMenu: 'See the menu of 19:00–21:00',
  deleteMenu: 'Delete menu',
  deleting: 'Deleting menu…',
  deleteTitle: 'Delete this menu?',
  deleteText: 'Hikers will no longer see a menu for 19:00–21:00.',
  keepMenu: 'Keep menu',
  deleted: 'Menu deleted for 19:00–21:00.',
  deleteFailed: 'The menu could not be deleted. Please try again.',
  removeDishTitle: 'Remove this dish?',
  keepDish: 'Keep dish',
} as const;

const employeeUser = { id: 2, email: 'employee@hut.test', role: 'EMPLOYEE' };

const slot: SlotDetails = {
  id: 1,
  date: '2026-11-04',
  startTime: '19:00',
  endTime: '21:00',
  tables: [{ tableNumber: 1, seats: 4 }],
  totalSeats: 4,
};

const MENU_URL = '/api/slots/1/menu';

// A menu written with the editor: one course, one dish.
const polentaText = '## Primi\n\n### Polenta concia · € 12\n*Polenta with cheese*\nMarks: Dairy';
// A menu sent straight to the API: not the layout of the editor.
const freeText = '**Today** a *warm* soup\n- barley\n  - with speck';

// Four courses of four dishes with the longest descriptions: over the 5000 characters of the API.
const longCourses: MenuCourse[] = ['Antipasti', 'Primi', 'Secondi', 'Dolci'].map((name) => ({
  name,
  dishes: [1, 2, 3, 4].map((n) => ({
    name: `Piatto ${n}`,
    translation: `Dish ${n}`,
    price: 10,
    description: 'x'.repeat(280),
    marks: [],
  })),
}));

const pastMenu = (slotId: number, text: string, startTime = '12:00', endTime = '14:00') => ({
  slotId,
  text,
  updatedAt: '2026-11-01T09:00:00.000Z',
  date: '2026-11-01',
  startTime,
  endTime,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const savedMenu = (text: string) =>
  json({ slotId: 1, text, updatedAt: '2026-11-04T09:00:00.000Z' });

interface MockOptions {
  // GET of the slot menu; by default the slot has no menu.
  menu?: () => Response | Promise<Response>;
  past?: () => Response;
  put?: (body: { text: string }) => Response | Promise<Response>;
  // DELETE of the slot menu; by default it succeeds with 204.
  del?: () => Response | Promise<Response>;
}

const noMenu = () => json({ message: MENU_ERRORS.noMenu }, 404);

function stubMenuApi({
  menu = noMenu,
  past = () => json([]),
  put = (body) => savedMenu(body.text),
  del = () => new Response(null, { status: 204 }),
}: MockOptions = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/auth/me') return Promise.resolve(json(employeeUser));
    if (url === '/api/auth/refresh') return Promise.resolve(json({}, 401));
    if (url.startsWith('/api/slots/schedule')) return Promise.resolve(json([slot]));
    if (url === '/api/menus') return Promise.resolve(past());
    if (url === MENU_URL && init?.method === 'PUT') {
      return Promise.resolve(put(JSON.parse(init.body as string) as { text: string }));
    }
    if (url === MENU_URL && init?.method === 'DELETE') return Promise.resolve(del());
    if (url === MENU_URL) return Promise.resolve(menu());
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const putCalls = (fetchMock: ReturnType<typeof stubMenuApi>) =>
  fetchMock.mock.calls.filter(([url, init]) => url === MENU_URL && init?.method === 'PUT');
const deleteCalls = (fetchMock: ReturnType<typeof stubMenuApi>) =>
  fetchMock.mock.calls.filter(([url, init]) => url === MENU_URL && init?.method === 'DELETE');

function renderSlotsPage() {
  const router = createMemoryRouter(routes, { initialEntries: ['/staff/slots'] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

// Opens the editor from the slot card, once the button knows whether a menu exists.
async function openEditor(name: string = TEXT.define) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  return screen.findByRole('dialog', { name: TEXT.title });
}

// The questions (discard, delete, remove) open in a popup above the editor, outside of it.
const question = (name: string) => screen.getByRole('alertdialog', { name });
const answer = (title: string, button: string) =>
  fireEvent.click(within(question(title)).getByRole('button', { name: button }));

const dishGroup = (dialog: HTMLElement, name = 'Antipasti · dish 1') =>
  within(dialog).getByRole('group', { name });

function fillDish(
  group: HTMLElement,
  dish: { name?: string; translation?: string; price?: string; description?: string },
) {
  const set = (label: string, value: string | undefined) => {
    if (value !== undefined) {
      fireEvent.change(within(group).getByLabelText(label), { target: { value } });
    }
  };
  set(TEXT.name, dish.name);
  set(TEXT.translation, dish.translation);
  set(TEXT.price, dish.price);
  set(TEXT.description, dish.description);
}

describe('MenuEditor (MH-10)', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 10, 4, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('opening the editor', () => {
    it('shows a loading notice while the menu of the slot is read', async () => {
      stubMenuApi({ menu: () => new Promise<Response>(() => {}) });
      renderSlotsPage();

      const button = await screen.findByRole('button', { name: TEXT.define });
      expect(button).toBeDisabled();
    });

    it('shows an error with a close button when the menu cannot be read', async () => {
      // The slot card keeps its button enabled after the error, so the editor can be opened.
      stubMenuApi({ menu: () => json({ message: 'boom' }, 500) });
      renderSlotsPage();

      const dialog = await openEditor();
      expect(await within(dialog).findByText(TEXT.loadFailed)).toBeInTheDocument();
      fireEvent.click(within(dialog).getAllByRole('button', { name: TEXT.close })[1]!);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('starts a slot without a menu from the four default courses (R1, R2)', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      expect(within(dialog).getByText('Wed 4 Nov', { exact: false })).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Course 1')).toHaveValue('Antipasti');
      expect(within(dialog).getByLabelText('Course 2')).toHaveValue('Primi');
      expect(within(dialog).getByLabelText('Course 3')).toHaveValue('Secondi');
      expect(within(dialog).getByLabelText('Course 4')).toHaveValue('Dolci');
      expect(within(dialog).getByLabelText(TEXT.startFrom)).toHaveValue('empty');
      expect(within(dialog).queryByRole('option', { name: TEXT.thisMenu })).not.toBeInTheDocument();
      expect(within(dialog).getByText(TEXT.reuseHint)).toBeInTheDocument();
      // Four courses already: no fifth one.
      expect(within(dialog).getByRole('button', { name: TEXT.maxCourses })).toBeDisabled();
    });

    it('opens the saved menu of the slot with its dishes (R1)', async () => {
      stubMenuApi({ menu: () => savedMenu(polentaText) });
      renderSlotsPage();

      expect(await screen.findByText('Menu · 1 course')).toBeInTheDocument();
      const dialog = await openEditor(TEXT.edit);
      expect(within(dialog).getByLabelText(TEXT.startFrom)).toHaveValue('saved');
      expect(within(dialog).getByLabelText('Course 1')).toHaveValue('Primi');
      const dish = dishGroup(dialog, 'Primi · dish 1');
      expect(within(dish).getByLabelText(TEXT.name)).toHaveValue('Polenta concia');
      expect(within(dish).getByLabelText(TEXT.translation)).toHaveValue('Polenta with cheese');
      expect(within(dish).getByLabelText(TEXT.price)).toHaveValue('12');
      expect(within(dish).getByRole('checkbox', { name: 'Dairy' })).toBeChecked();
      expect(within(dish).getByRole('checkbox', { name: 'Gluten' })).not.toBeChecked();
    });

    it('warns that a free text written outside the editor is replaced on save', async () => {
      stubMenuApi({ menu: () => savedMenu(freeText) });
      renderSlotsPage();

      expect(await screen.findByText('Menu · free text')).toBeInTheDocument();
      const dialog = await openEditor(TEXT.edit);
      expect(within(dialog).getByText(TEXT.freeTextHint)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(TEXT.startFrom)).toHaveValue('empty');
      expect(within(dialog).getByLabelText('Course 1')).toHaveValue('Antipasti');
    });
  });

  describe('client-side validation (R5)', () => {
    it('does not save a menu without dishes', async () => {
      const fetchMock = stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.save }));

      expect(await within(dialog).findByText(TEXT.noDish)).toHaveAttribute('role', 'alert');
      expect(putCalls(fetchMock)).toHaveLength(0);
    });

    it('marks every empty field of a dish and does not save', async () => {
      const fetchMock = stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.addDish }));
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.save }));

      const dish = dishGroup(dialog);
      expect(await within(dish).findByText(TEXT.dishName)).toBeInTheDocument();
      expect(within(dish).getByText(TEXT.englishName)).toBeInTheDocument();
      expect(within(dish).getByText(TEXT.priceAboveZero)).toBeInTheDocument();
      expect(within(dish).getByLabelText(TEXT.name)).toHaveAttribute('aria-invalid', 'true');
      expect(within(dialog).getByText(TEXT.fixFields)).toHaveAttribute('role', 'alert');
      expect(putCalls(fetchMock)).toHaveLength(0);
    });

    it.each([
      ['0', TEXT.priceAboveZero],
      ['abc', TEXT.priceAboveZero],
      ['1000', TEXT.priceTooHigh],
    ])('rejects the price "%s"', async (price, message) => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.addDish }));
      fillDish(dishGroup(dialog), { name: 'Canederli', translation: 'Dumplings', price });
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.save }));

      expect(await within(dialog).findByText(message)).toBeInTheDocument();
    });

    it('rejects a description over 280 characters and counts the characters', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.addDish }));
      const dish = dishGroup(dialog);
      fillDish(dish, {
        name: 'Canederli',
        translation: 'Dumplings',
        price: '12',
        description: 'a'.repeat(281),
      });
      expect(within(dish).getByText('281/280')).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.save }));

      expect(await within(dish).findByText(TEXT.longDescription)).toBeInTheDocument();
      expect(within(dish).getByLabelText(TEXT.description)).toHaveAttribute('aria-invalid', 'true');
    });

    it('asks to name a course that has dishes', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.addDish }));
      fillDish(dishGroup(dialog), { name: 'Canederli', translation: 'Dumplings', price: '12' });
      fireEvent.change(within(dialog).getByLabelText('Course 1'), { target: { value: ' ' } });
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.save }));

      expect(await within(dialog).findByText(TEXT.courseName)).toBeInTheDocument();
    });

    it('does not send a menu longer than the 5000 characters of the API', async () => {
      const fetchMock = stubMenuApi({
        past: () => json([pastMenu(7, menuToText(longCourses))]),
      });
      renderSlotsPage();

      const dialog = await openEditor();
      const startFrom = within(dialog).getByLabelText(TEXT.startFrom);
      await within(dialog).findByRole('option', { name: TEXT.pastMenu });
      fireEvent.change(startFrom, { target: { value: '7' } });

      // Four dishes in every course: no more can be added.
      expect(within(dialog).getAllByRole('button', { name: TEXT.maxDishes })).toHaveLength(4);
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.save }));

      expect(await within(dialog).findByText(TEXT.tooLong)).toHaveAttribute('role', 'alert');
      expect(putCalls(fetchMock)).toHaveLength(0);
    });
  });

  describe('saving (R2, R3, R8)', () => {
    it('sends the menu as text, closes and confirms with a toast', async () => {
      const fetchMock = stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.addDish }));
      const dish = dishGroup(dialog);
      fillDish(dish, {
        name: ' Tagliere di salumi ',
        translation: 'Cured meats and alpine cheeses',
        // A comma is accepted as the decimal separator.
        price: '9,50',
        description: 'Speck and **lardo**',
      });
      // Ticked out of order, written in the order of the legend.
      fireEvent.click(within(dish).getByRole('checkbox', { name: 'Dairy' }));
      fireEvent.click(within(dish).getByRole('checkbox', { name: 'Gluten' }));
      // Ticked twice: not marked.
      fireEvent.click(within(dish).getByRole('checkbox', { name: 'Vegan' }));
      fireEvent.click(within(dish).getByRole('checkbox', { name: 'Vegan' }));
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.save }));

      expect(await screen.findByText(TEXT.saved)).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      const [, init] = putCalls(fetchMock)[0]!;
      expect(JSON.parse(init!.body as string)).toEqual({
        text:
          '## Antipasti\n\n### Tagliere di salumi · € 9.50\n*Cured meats and alpine cheeses*\n' +
          'Marks: Gluten, Dairy\nSpeck and **lardo**',
      });
    });

    it('reuses a previous menu: only menus of other slots written with the editor (R4)', async () => {
      const fetchMock = stubMenuApi({
        menu: () => savedMenu(polentaText),
        past: () =>
          json([
            pastMenu(1, polentaText, '19:00', '21:00'),
            pastMenu(8, freeText, '08:00', '09:00'),
            pastMenu(7, '## Dolci\n\n### Strudel · € 6\n*Apple strudel*'),
          ]),
      });
      renderSlotsPage();

      const dialog = await openEditor(TEXT.edit);
      const startFrom = within(dialog).getByLabelText(TEXT.startFrom);
      await within(dialog).findByRole('option', { name: TEXT.pastMenu });
      expect(within(startFrom).getAllByRole('option')).toHaveLength(3);
      fireEvent.change(startFrom, { target: { value: '7' } });

      expect(within(dialog).getByLabelText('Course 1')).toHaveValue('Dolci');
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.save }));

      expect(await screen.findByText(TEXT.saved)).toBeInTheDocument();
      const [, init] = putCalls(fetchMock)[0]!;
      expect(JSON.parse(init!.body as string)).toEqual({
        text: '## Dolci\n\n### Strudel · € 6\n*Apple strudel*',
      });
    });

    it('goes back to the saved menu and to an empty menu from "Start from"', async () => {
      stubMenuApi({
        menu: () => savedMenu(polentaText),
        past: () => json([pastMenu(7, '## Dolci\n\n### Strudel · € 6\n*Apple strudel*')]),
      });
      renderSlotsPage();

      const dialog = await openEditor(TEXT.edit);
      const startFrom = within(dialog).getByLabelText(TEXT.startFrom);
      fireEvent.change(startFrom, { target: { value: 'empty' } });
      expect(within(dialog).getByLabelText('Course 1')).toHaveValue('Antipasti');

      // The empty menu is a change from the saved one: going back to it asks first.
      fireEvent.change(startFrom, { target: { value: 'saved' } });
      answer(TEXT.discardTitle, TEXT.discard);
      expect(within(dialog).getByLabelText('Course 1')).toHaveValue('Primi');
      expect(startFrom).toHaveValue('saved');
    });

    it('disables the save button while the menu is being saved', async () => {
      stubMenuApi({ put: () => new Promise<Response>(() => {}) });
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.addDish }));
      fillDish(dishGroup(dialog), { name: 'Canederli', translation: 'Dumplings', price: '12' });
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.save }));

      expect(await within(dialog).findByRole('button', { name: TEXT.saving })).toBeDisabled();
      // While saving, neither Escape nor Close leave the editor.
      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.click(within(dialog).getAllByRole('button', { name: TEXT.close })[1]!);
      expect(screen.getByRole('dialog', { name: TEXT.title })).toBeInTheDocument();
      expect(within(dialog).queryByText(TEXT.discardTitle)).not.toBeInTheDocument();
    });

    it('asks to sign in again when the session has expired (401)', async () => {
      stubMenuApi({ put: () => json({ message: 'Unauthorized' }, 401) });
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.addDish }));
      fillDish(dishGroup(dialog), { name: 'Canederli', translation: 'Dumplings', price: '12' });
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.save }));

      const alert = await within(dialog).findByText(/The session has expired/);
      expect(alert).toHaveTextContent(TEXT.sessionExpired);
      expect(within(alert).getByRole('link', { name: 'sign in' })).toHaveAttribute(
        'href',
        '/login?next=%2Fstaff%2Fslots',
      );
    });

    it.each([
      [404, MENU_ERRORS.slotNotFound, MENU_ERRORS.slotNotFound],
      [409, 'Conflict', TEXT.saveFailed],
      // The slot started while the editor was open: the API says so.
      [422, MENU_ERRORS.startedChange, MENU_ERRORS.startedChange],
    ])(
      'shows the error of a %i answer and keeps the editor open',
      async (status, message, shown) => {
        stubMenuApi({ put: () => json({ message }, status) });
        renderSlotsPage();

        const dialog = await openEditor();
        fireEvent.click(within(dialog).getByRole('button', { name: TEXT.addDish }));
        fillDish(dishGroup(dialog), { name: 'Canederli', translation: 'Dumplings', price: '12' });
        fireEvent.click(within(dialog).getByRole('button', { name: TEXT.save }));

        expect(await within(dialog).findByText(shown)).toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: TEXT.title })).toBeInTheDocument();

        // Editing again clears the error.
        fireEvent.change(within(dishGroup(dialog)).getByLabelText(TEXT.price), {
          target: { value: '13' },
        });
        expect(within(dialog).queryByText(shown)).not.toBeInTheDocument();
      },
    );
  });

  describe('removing and undoing', () => {
    it('removes a dish and puts it back with Undo', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.addDish }));
      fillDish(dishGroup(dialog), { name: 'Canederli in brodo' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Canederli in brodo' }));
      expect(question('Remove this dish?')).toHaveAccessibleDescription(
        'Canederli in brodo will be removed from Antipasti.',
      );
      answer('Remove this dish?', 'Remove dish');

      expect(within(dialog).queryByRole('group', { name: 'Antipasti · dish 1' })).toBeNull();
      expect(await screen.findByText('Dish removed: Canederli in brodo.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: TEXT.undo }));

      expect(within(dishGroup(dialog)).getByLabelText(TEXT.name)).toHaveValue('Canederli in brodo');
    });

    it('removes a dish without a name', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.addDish }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove dish 1' }));
      expect(question('Remove this dish?')).toHaveAccessibleDescription(
        'This dish will be removed from Antipasti.',
      );
      answer('Remove this dish?', 'Remove dish');

      expect(await screen.findByText('Dish removed.')).toBeInTheDocument();
    });

    it('removes a course, puts it back with Undo, and adds a new course', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove the course Antipasti' }));
      expect(question('Remove this course?')).toHaveAccessibleDescription(
        'Antipasti will be removed from the menu.',
      );
      answer('Remove this course?', 'Remove course');

      expect(within(dialog).getByLabelText('Course 1')).toHaveValue('Primi');
      expect(await screen.findByText('Course removed: Antipasti.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: TEXT.undo }));
      expect(within(dialog).getByLabelText('Course 1')).toHaveValue('Antipasti');

      // A course without a name: removed, then a new empty one is added in its place.
      fireEvent.change(within(dialog).getByLabelText('Course 4'), { target: { value: '' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove the course 4' }));
      expect(question('Remove this course?')).toHaveAccessibleDescription(
        'This course will be removed from the menu.',
      );
      answer('Remove this course?', 'Remove course');
      expect(await screen.findByText('Course removed.')).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.addCourse }));
      expect(within(dialog).getByLabelText('Course 4')).toHaveValue('');
      expect(within(dialog).getByRole('button', { name: 'Add a dish to course 4' })).toBeEnabled();
    });

    it('does not put a course back when the menu already has four', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove the course Dolci' }));
      answer('Remove this course?', 'Remove course');
      await screen.findByText('Course removed: Dolci.');
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.addCourse }));
      fireEvent.click(screen.getByRole('button', { name: TEXT.undo }));

      expect(within(dialog).getByLabelText('Course 4')).toHaveValue('');
      expect(within(dialog).queryByDisplayValue('Dolci')).not.toBeInTheDocument();
    });
  });

  describe('leaving with unsaved changes (R6)', () => {
    it('closes at once when nothing has changed, with Close or Escape', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getAllByRole('button', { name: TEXT.close })[1]!);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await openEditor();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('asks before closing with changes: Keep editing, then Discard', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.change(within(dialog).getByLabelText('Course 1'), {
        target: { value: 'Taglieri' },
      });
      fireEvent.click(within(dialog).getAllByRole('button', { name: TEXT.close })[1]!);

      expect(question(TEXT.discardTitle)).toHaveAccessibleDescription(
        'The changes you made to this menu will be lost.',
      );
      const keep = within(question(TEXT.discardTitle)).getByRole('button', { name: TEXT.keep });
      await waitFor(() => expect(keep).toHaveFocus());
      fireEvent.click(keep);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(within(dialog).getByLabelText('Course 1')).toHaveValue('Taglieri');

      fireEvent.click(within(dialog).getAllByRole('button', { name: TEXT.close })[1]!);
      answer(TEXT.discardTitle, TEXT.discard);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('asks on Escape, and a second Escape answers "keep editing"', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.change(within(dialog).getByLabelText('Course 1'), {
        target: { value: 'Taglieri' },
      });
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(question(TEXT.discardTitle)).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: TEXT.title })).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Course 1')).toHaveValue('Taglieri');

      // Other keys do nothing.
      fireEvent.keyDown(document, { key: 'Enter' });
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('asks from the × button and from the backdrop, not from a click inside', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.change(within(dialog).getByLabelText('Course 1'), {
        target: { value: 'Taglieri' },
      });

      fireEvent.click(dialog);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

      fireEvent.click(dialog.parentElement!);
      answer(TEXT.discardTitle, TEXT.keep);

      fireEvent.click(within(dialog).getAllByRole('button', { name: TEXT.close })[0]!);
      expect(question(TEXT.discardTitle)).toBeInTheDocument();
    });

    it('does not count edits that put back the original values', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      const course = within(dialog).getByLabelText('Course 1');
      fireEvent.change(course, { target: { value: 'Taglieri' } });
      fireEvent.change(course, { target: { value: 'Antipasti' } });
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('asks before replacing changes with another "Start from" menu', async () => {
      stubMenuApi({
        past: () => json([pastMenu(7, '## Dolci\n\n### Strudel · € 6\n*Apple strudel*')]),
      });
      renderSlotsPage();

      const dialog = await openEditor();
      await within(dialog).findByRole('option', { name: TEXT.pastMenu });
      fireEvent.change(within(dialog).getByLabelText('Course 1'), {
        target: { value: 'Taglieri' },
      });
      fireEvent.change(within(dialog).getByLabelText(TEXT.startFrom), { target: { value: '7' } });

      expect(question(TEXT.discardTitle)).toHaveAccessibleDescription(
        'The changes you made will be replaced by the menu you picked.',
      );
      answer(TEXT.discardTitle, TEXT.discard);
      expect(within(dialog).getByLabelText('Course 1')).toHaveValue('Dolci');
    });
  });

  describe('removing needs a confirmation', () => {
    it('keeps the dish with Keep dish, Escape or the backdrop', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.addDish }));
      fillDish(dishGroup(dialog), { name: 'Canederli' });
      const remove = () =>
        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Canederli' }));

      remove();
      answer(TEXT.removeDishTitle, TEXT.keepDish);
      remove();
      fireEvent.keyDown(document, { key: 'Escape' });
      remove();
      fireEvent.click(question(TEXT.removeDishTitle).parentElement!);

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(within(dishGroup(dialog)).getByLabelText(TEXT.name)).toHaveValue('Canederli');
      // Escape answered the question only: the editor is still open.
      expect(screen.getByRole('dialog', { name: TEXT.title })).toBeInTheDocument();
    });
  });

  describe('deleting the menu of a future slot (R12)', () => {
    it('deletes the menu after asking, says so and offers to define it again', async () => {
      let stored = true;
      const fetchMock = stubMenuApi({
        menu: () => (stored ? savedMenu(polentaText) : noMenu()),
        del: () => {
          stored = false;
          return new Response(null, { status: 204 });
        },
      });
      renderSlotsPage();

      const dialog = await openEditor(TEXT.edit);
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.deleteMenu }));
      expect(question(TEXT.deleteTitle)).toHaveAccessibleDescription(TEXT.deleteText);
      await waitFor(() =>
        expect(
          within(question(TEXT.deleteTitle)).getByRole('button', { name: TEXT.keepMenu }),
        ).toHaveFocus(),
      );
      answer(TEXT.deleteTitle, TEXT.deleteMenu);

      expect(await screen.findByText(TEXT.deleted)).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: TEXT.title })).not.toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(deleteCalls(fetchMock)).toHaveLength(1);
      expect(await screen.findByRole('button', { name: TEXT.define })).toBeInTheDocument();
    });

    it('keeps the menu with Keep menu or Escape', async () => {
      const fetchMock = stubMenuApi({ menu: () => savedMenu(polentaText) });
      renderSlotsPage();

      const dialog = await openEditor(TEXT.edit);
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.deleteMenu }));
      answer(TEXT.deleteTitle, TEXT.keepMenu);
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.deleteMenu }));
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: TEXT.title })).toBeInTheDocument();
      expect(deleteCalls(fetchMock)).toHaveLength(0);
    });

    it('cannot be answered again or closed while the menu is being deleted', async () => {
      stubMenuApi({ menu: () => savedMenu(polentaText), del: () => new Promise(() => {}) });
      renderSlotsPage();

      const dialog = await openEditor(TEXT.edit);
      fireEvent.click(within(dialog).getByRole('button', { name: TEXT.deleteMenu }));
      answer(TEXT.deleteTitle, TEXT.deleteMenu);

      const busy = within(question(TEXT.deleteTitle));
      expect(await busy.findByRole('button', { name: TEXT.deleting })).toBeDisabled();
      expect(busy.getByRole('button', { name: TEXT.keepMenu })).toBeDisabled();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(question(TEXT.deleteTitle)).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: TEXT.title })).toBeInTheDocument();
    });

    it.each([
      [404, MENU_ERRORS.noMenu, MENU_ERRORS.noMenu],
      // The slot started while the editor was open.
      [422, MENU_ERRORS.startedDelete, MENU_ERRORS.startedDelete],
      [500, 'Internal server error', TEXT.deleteFailed],
    ])(
      'shows why a %i answer left the menu, in the open editor',
      async (status, message, shown) => {
        stubMenuApi({ menu: () => savedMenu(polentaText), del: () => json({ message }, status) });
        renderSlotsPage();

        const dialog = await openEditor(TEXT.edit);
        fireEvent.click(within(dialog).getByRole('button', { name: TEXT.deleteMenu }));
        answer(TEXT.deleteTitle, TEXT.deleteMenu);

        expect(await within(dialog).findByText(shown)).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: TEXT.title })).toBeInTheDocument();
      },
    );

    it('offers to delete only a menu that exists', async () => {
      stubMenuApi();
      renderSlotsPage();

      const dialog = await openEditor();
      expect(within(dialog).queryByRole('button', { name: TEXT.deleteMenu })).toBeNull();
    });
  });

  describe('once the slot has started (R10, R12)', () => {
    it('only shows the menu: no editing, no deleting', async () => {
      // The slot of 19:00 has just started.
      vi.setSystemTime(new Date(2026, 10, 4, 19, 0, 0));
      stubMenuApi({ menu: () => savedMenu(polentaText) });
      renderSlotsPage();

      fireEvent.click(await screen.findByRole('button', { name: TEXT.seeMenu }));
      const preview = await screen.findByRole('dialog', { name: '19:00–21:00, Wed 4 Nov' });
      expect(await within(preview).findByText('Polenta concia')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: TEXT.edit })).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: TEXT.title })).not.toBeInTheDocument();
    });

    it('offers nothing to a slot without a menu', async () => {
      vi.setSystemTime(new Date(2026, 10, 4, 20, 0, 0));
      const fetchMock = stubMenuApi();
      renderSlotsPage();

      // Once the menu answer has arrived, no menu button is left.
      await waitFor(() =>
        expect(fetchMock.mock.calls.some(([url]) => url === MENU_URL)).toBe(true),
      );
      await screen.findByRole('link', { name: 'Floor plan of 19:00–21:00' });
      expect(screen.queryByRole('button', { name: TEXT.define })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: TEXT.seeMenu })).not.toBeInTheDocument();
    });

    it('can still be changed one minute before the start', async () => {
      vi.setSystemTime(new Date(2026, 10, 4, 18, 59, 0));
      stubMenuApi({ menu: () => savedMenu(polentaText) });
      renderSlotsPage();

      expect(await openEditor(TEXT.edit)).toBeInTheDocument();
    });
  });

  describe('preview as hikers see it (R9)', () => {
    it('shows the dishes, their marks, the price and the legend', async () => {
      stubMenuApi({
        menu: () =>
          savedMenu(
            '## Antipasti\n\n### Tagliere · € 9.50\n*Cured meats*\n' +
              'Marks: Gluten, Dairy, Egg, Nuts, Soy, Vegetarian, Vegan\nSpeck and **lardo**\n\n' +
              '### Pane · € 3\n*Bread*',
          ),
      });
      renderSlotsPage();

      fireEvent.click(await screen.findByRole('button', { name: '19:00–21:00' }));
      const dialog = await screen.findByRole('dialog', { name: '19:00–21:00, Wed 4 Nov' });

      expect(within(dialog).getByText(TEXT.preview)).toBeInTheDocument();
      expect(await within(dialog).findByText('Tagliere')).toBeInTheDocument();
      expect(within(dialog).getByText('€ 9.50')).toBeInTheDocument();
      expect(within(dialog).getByText('€ 3')).toBeInTheDocument();
      expect(within(dialog).getByText('Cured meats')).toBeInTheDocument();
      expect(within(dialog).getByText('lardo').tagName).toBe('STRONG');
      expect(within(dialog).getByTitle('Gluten')).toBeInTheDocument();
      expect(within(dialog).getByTitle('Vegan')).toBeInTheDocument();
      const legend = within(dialog).getByRole('list', { name: 'Legend' });
      expect(within(legend).getAllByRole('listitem')).toHaveLength(7);
    });

    it('shows a free text with its formatting', async () => {
      stubMenuApi({ menu: () => savedMenu(freeText) });
      renderSlotsPage();

      fireEvent.click(await screen.findByRole('button', { name: '19:00–21:00' }));
      const dialog = await screen.findByRole('dialog', { name: '19:00–21:00, Wed 4 Nov' });

      expect((await within(dialog).findByText('Today')).tagName).toBe('STRONG');
      expect(within(dialog).getByText('warm').tagName).toBe('EM');
      expect(within(dialog).getByText('barley')).toBeInTheDocument();
      expect(within(dialog).getByText('with speck').closest('ul ul')).not.toBeNull();
    });

    it('says when the menu is not out yet, and closes with Close or Escape', async () => {
      stubMenuApi();
      renderSlotsPage();

      fireEvent.click(await screen.findByRole('button', { name: '19:00–21:00' }));
      let dialog = await screen.findByRole('dialog', { name: '19:00–21:00, Wed 4 Nov' });
      expect(await within(dialog).findByText(TEXT.notOut)).toBeInTheDocument();
      fireEvent.click(within(dialog).getAllByRole('button', { name: TEXT.close })[1]!);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '19:00–21:00' }));
      dialog = await screen.findByRole('dialog', { name: '19:00–21:00, Wed 4 Nov' });
      fireEvent.keyDown(document, { key: 'Enter' });
      expect(dialog).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
