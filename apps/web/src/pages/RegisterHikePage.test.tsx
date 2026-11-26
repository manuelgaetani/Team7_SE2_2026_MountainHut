import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PredefinedHike, RegisteredHike } from '@mountain-hut/shared';
import { json, renderAt, sentBody, stubApi, user } from '../test/app.tsx';

const TEXT = {
  title: 'Register a hike',
  signIn: 'Sign in',
  staffOnly: 'Staff accounts cannot register a hike.',
  presets: 'Start from a popular hike',
  scratch: 'Start from scratch',
  destination: 'Destination *',
  route: 'Route *',
  departureDate: 'Departure date *',
  departureTime: 'Departure time *',
  returnDate: 'Expected return date *',
  returnTime: 'Expected return time *',
  addPoint: 'Add a passage point',
  addAnotherPoint: 'Add another passage point',
  submit: 'Register the hike',
  destinationRequired: 'Enter the destination of the hike.',
  routeRequired: 'Describe the route you will take.',
  departureDateRequired: 'Choose the departure date.',
  departureTimeRequired: 'Enter the departure time as hh:mm.',
  returnDateRequired: 'Choose the expected return date.',
  returnTimeRequired: 'Enter the expected return time as hh:mm.',
  returnBeforeDeparture: 'The expected return must be after the planned departure.',
  departurePast: 'The planned departure must be in the future.',
  pointEmpty: 'Enter the name of the place, or remove this passage point.',
  pointRemoved: 'Passage point removed.',
  undo: 'Undo',
  registered: 'Hike registered: Monte Vettore, Friday 27 November 2026 at 08:00.',
  viewMine: 'View my hikes',
  sessionExpired: /The session has expired/,
  overlap: 'This hike overlaps your hike to Monte Vettore (2026-11-27 08:00 – 2026-11-27 17:00)',
  failed: 'The hike could not be registered. Please try again.',
} as const;

const HIKES_URL = '/api/hikes';
const PREDEFINED_URL = '/api/hikes/predefined';

const vettore: PredefinedHike = {
  id: 2,
  destination: 'Monte Vettore',
  route: 'From Forca di Presta via Rifugio Zilioli',
  passagePoints: ['Forca di Presta', 'Rifugio Tito Zilioli'],
};
const pilato: PredefinedHike = {
  id: 3,
  destination: 'Lago di Pilato',
  route: 'From Foce via the Valle del Lago',
  passagePoints: [],
};

const registered = (patch: Partial<RegisteredHike> = {}): RegisteredHike => ({
  id: 1,
  destination: vettore.destination,
  route: vettore.route,
  passagePoints: vettore.passagePoints,
  departureDate: '2026-11-27',
  departureTime: '08:00',
  returnDate: '2026-11-27',
  returnTime: '17:00',
  predefinedHikeId: vettore.id,
  ...patch,
});

const hikerSession = () => json(user);
const staffSession = () => json({ id: 2, email: 'employee@hut.test', role: 'EMPLOYEE' });

function stub(handlers: Record<string, () => Response> = {}) {
  return stubApi({
    '/api/auth/me': hikerSession,
    [PREDEFINED_URL]: () => json([vettore, pilato]),
    [HIKES_URL]: () => json(registered(), 201),
    ...handlers,
  });
}

async function openPage() {
  renderAt('/hikes/new');
  await screen.findByRole('button', { name: TEXT.submit });
}

function pickDate(label: string, day: string) {
  fireEvent.click(screen.getByLabelText(label));
  const calendar = within(screen.getByRole('group', { name: 'Calendar' }));
  fireEvent.click(calendar.getByRole('button', { name: day }));
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillWhen({
  departureDay = 'Fri 27 Nov',
  departureTime = '08:00',
  returnDay,
  returnTime = '17:00',
}: {
  departureDay?: string;
  departureTime?: string;
  returnDay?: string;
  returnTime?: string;
} = {}) {
  pickDate(TEXT.departureDate, departureDay);
  type(TEXT.departureTime, departureTime);
  if (returnDay) pickDate(TEXT.returnDate, returnDay);
  type(TEXT.returnTime, returnTime);
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: TEXT.submit }));
const posts = (fetchMock: ReturnType<typeof stub>) =>
  fetchMock.mock.calls.filter(([url, init]) => url === HIKES_URL && init?.method === 'POST');

describe('RegisterHikePage (MH-20)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Thursday 26 November 2026, 10:00 local time.
    vi.setSystemTime(new Date(2026, 10, 26, 10, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('access', () => {
    it('asks an anonymous visitor to sign in and comes back here after it', async () => {
      stubApi();
      renderAt('/hikes/new');
      const notice = await screen.findByText(/to register a hike\./);
      const link = within(notice).getByRole('link', { name: TEXT.signIn });
      expect(link).toHaveAttribute('href', '/login?next=%2Fhikes%2Fnew');
      expect(screen.getByRole('heading', { name: TEXT.title })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: TEXT.submit })).not.toBeInTheDocument();
    });

    it('tells a staff member the page is for hikers, without loading the hikes', async () => {
      const fetchMock = stubApi({ '/api/auth/me': staffSession });
      renderAt('/hikes/new');
      expect(await screen.findByText(TEXT.staffOnly)).toBeInTheDocument();
      expect(fetchMock.mock.calls.some(([url]) => url === PREDEFINED_URL)).toBe(false);
    });

    it('shows the form to a hiker', async () => {
      stub();
      await openPage();
      expect(screen.getByLabelText(TEXT.destination)).toHaveValue('');
      expect(screen.getByLabelText(TEXT.route)).toHaveValue('');
    });
  });

  describe('predefined hikes', () => {
    it('lists the hut hikes and fills the form with the chosen one', async () => {
      stub();
      await openPage();
      const option = await screen.findByRole('button', { name: /Monte Vettore/ });
      expect(option).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(option);

      expect(option).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText(TEXT.destination)).toHaveValue(vettore.destination);
      expect(screen.getByLabelText(TEXT.route)).toHaveValue(vettore.route);
      expect(screen.getByLabelText('Passage point 1')).toHaveValue('Forca di Presta');
      expect(screen.getByLabelText('Passage point 2')).toHaveValue('Rifugio Tito Zilioli');
    });

    it('starts from scratch again, emptying what the hike filled', async () => {
      stub();
      await openPage();
      fireEvent.click(await screen.findByRole('button', { name: /Monte Vettore/ }));
      fireEvent.click(screen.getByRole('button', { name: TEXT.scratch }));

      expect(screen.getByLabelText(TEXT.destination)).toHaveValue('');
      expect(screen.queryByLabelText('Passage point 1')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Monte Vettore/ })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('hides the section when the hut has no predefined hikes', async () => {
      stub({ [PREDEFINED_URL]: () => json([]) });
      await openPage();
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
      expect(screen.queryByText(TEXT.presets)).not.toBeInTheDocument();
    });

    it('still lets the hiker write a hike when the list cannot be loaded', async () => {
      stub({ [PREDEFINED_URL]: () => json({ message: 'boom' }, 500) });
      await openPage();
      expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.failed);
      expect(screen.getByLabelText(TEXT.destination)).toBeEnabled();
    });
  });

  describe('client validation', () => {
    it('marks every required field and sends nothing', async () => {
      const fetchMock = stub();
      await openPage();
      submit();

      expect(screen.getByText(TEXT.destinationRequired)).toBeInTheDocument();
      expect(screen.getByText(TEXT.routeRequired)).toBeInTheDocument();
      expect(screen.getByText(TEXT.departureDateRequired)).toBeInTheDocument();
      expect(screen.getByText(TEXT.departureTimeRequired)).toBeInTheDocument();
      expect(screen.getByText(TEXT.returnDateRequired)).toBeInTheDocument();
      expect(screen.getByText(TEXT.returnTimeRequired)).toBeInTheDocument();
      expect(screen.getByLabelText(TEXT.destination)).toHaveAttribute('aria-invalid', 'true');
      expect(posts(fetchMock)).toHaveLength(0);
    });

    it('refuses only spaces in the destination and the route', async () => {
      stub();
      await openPage();
      type(TEXT.destination, '   ');
      type(TEXT.route, '  ');
      fillWhen();
      submit();
      expect(screen.getByText(TEXT.destinationRequired)).toBeInTheDocument();
      expect(screen.getByText(TEXT.routeRequired)).toBeInTheDocument();
    });

    it('refuses a return that is not after the departure', async () => {
      const fetchMock = stub();
      await openPage();
      type(TEXT.destination, 'Monte Vettore');
      type(TEXT.route, 'From Forca di Presta');
      fillWhen({ departureTime: '08:00', returnTime: '08:00' });
      submit();
      expect(screen.getByText(TEXT.returnBeforeDeparture)).toBeInTheDocument();
      expect(posts(fetchMock)).toHaveLength(0);
    });

    it('refuses a departure that has already come today', async () => {
      const fetchMock = stub();
      await openPage();
      type(TEXT.destination, 'Monte Vettore');
      type(TEXT.route, 'From Forca di Presta');
      fillWhen({ departureDay: 'Thu 26 Nov', departureTime: '10:00', returnTime: '17:00' });
      submit();
      expect(screen.getByText(TEXT.departurePast)).toBeInTheDocument();
      expect(posts(fetchMock)).toHaveLength(0);
    });

    it('accepts a departure one minute in the future', async () => {
      const fetchMock = stub();
      await openPage();
      type(TEXT.destination, 'Monte Vettore');
      type(TEXT.route, 'From Forca di Presta');
      fillWhen({ departureDay: 'Thu 26 Nov', departureTime: '10:01', returnTime: '17:00' });
      submit();
      await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    });

    it('asks to fill or remove an empty passage point', async () => {
      const fetchMock = stub();
      await openPage();
      type(TEXT.destination, 'Monte Vettore');
      type(TEXT.route, 'From Forca di Presta');
      fireEvent.click(screen.getByRole('button', { name: TEXT.addPoint }));
      fillWhen();
      submit();
      expect(screen.getByText(TEXT.pointEmpty)).toBeInTheDocument();
      expect(screen.getByLabelText('Passage point 1')).toHaveAttribute('aria-invalid', 'true');
      expect(posts(fetchMock)).toHaveLength(0);
    });

    it('stops adding passage points at ten', async () => {
      stub();
      await openPage();
      fireEvent.click(screen.getByRole('button', { name: TEXT.addPoint }));
      for (let i = 0; i < 9; i += 1) {
        fireEvent.click(screen.getByRole('button', { name: TEXT.addAnotherPoint }));
      }
      expect(screen.getByLabelText('Passage point 10')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: TEXT.addAnotherPoint })).toBeDisabled();
    });

    it('removes a passage point and renumbers the others', async () => {
      stub();
      await openPage();
      fireEvent.click(await screen.findByRole('button', { name: /Monte Vettore/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Remove passage point 1' }));
      expect(screen.getByLabelText('Passage point 1')).toHaveValue('Rifugio Tito Zilioli');
      expect(screen.queryByLabelText('Passage point 2')).not.toBeInTheDocument();
    });
    it('offers to undo the removal of a passage point, back in its place', async () => {
      stub();
      await openPage();
      fireEvent.click(await screen.findByRole('button', { name: /Monte Vettore/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Remove passage point 1' }));
      expect(screen.getByRole('status')).toHaveTextContent(TEXT.pointRemoved);

      fireEvent.click(screen.getByRole('button', { name: TEXT.undo }));

      expect(screen.getByLabelText('Passage point 1')).toHaveValue('Forca di Presta');
      expect(screen.getByLabelText('Passage point 2')).toHaveValue('Rifugio Tito Zilioli');
      expect(screen.queryByRole('button', { name: TEXT.undo })).not.toBeInTheDocument();
    });

    it('closes the undo toast when the form is emptied after a registration', async () => {
      stub();
      await openPage();
      fireEvent.click(await screen.findByRole('button', { name: /Monte Vettore/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Remove passage point 2' }));
      fillWhen();
      submit();
      expect(await screen.findByText(TEXT.registered)).toBeVisible();
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: TEXT.undo })).not.toBeInTheDocument(),
      );
    });
  });

  describe('registration', () => {
    it('sends the hike started from a predefined one and confirms it with a toast', async () => {
      const fetchMock = stub();
      await openPage();
      fireEvent.click(await screen.findByRole('button', { name: /Monte Vettore/ }));
      // The return date follows the departure date.
      fillWhen({ departureTime: '800' });
      submit();

      expect(await screen.findByRole('status')).toHaveTextContent(TEXT.registered);
      expect(sentBody(fetchMock, HIKES_URL)).toEqual({
        destination: vettore.destination,
        route: vettore.route,
        passagePoints: vettore.passagePoints,
        departureDate: '2026-11-27',
        departureTime: '08:00',
        returnDate: '2026-11-27',
        returnTime: '17:00',
        predefinedHikeId: vettore.id,
      });
    });

    it('sends a hike written by hand, trimmed, without a predefined hike', async () => {
      const fetchMock = stub({
        [HIKES_URL]: () =>
          json(
            registered({ passagePoints: [], predefinedHikeId: null, returnDate: '2026-11-28' }),
            201,
          ),
      });
      await openPage();
      type(TEXT.destination, '  Monte Sibilla ');
      type(TEXT.route, 'From Montemonaco');
      fillWhen({ returnDay: 'Sat 28 Nov', returnTime: '12:00' });
      submit();

      await screen.findByText(/Hike registered/);
      expect(sentBody(fetchMock, HIKES_URL)).toEqual({
        destination: 'Monte Sibilla',
        route: 'From Montemonaco',
        passagePoints: [],
        departureDate: '2026-11-27',
        departureTime: '08:00',
        returnDate: '2026-11-28',
        returnTime: '12:00',
      });
    });

    it('empties the form after the registration', async () => {
      stub();
      await openPage();
      fireEvent.click(await screen.findByRole('button', { name: /Monte Vettore/ }));
      fillWhen();
      submit();
      await screen.findByText(TEXT.registered);

      expect(screen.getByLabelText(TEXT.destination)).toHaveValue('');
      expect(screen.getByRole('button', { name: /Monte Vettore/ })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('leads from the toast to the hikes in the personal area', async () => {
      stub({ '/api/hikes/mine': () => json([registered()]) });
      const router = renderAt('/hikes/new');
      await screen.findByRole('button', { name: TEXT.submit });
      fireEvent.click(await screen.findByRole('button', { name: /Monte Vettore/ }));
      fillWhen();
      submit();
      fireEvent.click(await screen.findByRole('button', { name: TEXT.viewMine }));

      await waitFor(() => expect(router.state.location.pathname).toBe('/hikes'));
      expect(await screen.findByRole('heading', { name: 'My hikes' })).toBeVisible();
    });

    it('shows the overlap explained by the API next to the form', async () => {
      stub({ [HIKES_URL]: () => json({ message: TEXT.overlap }, 409) });
      await openPage();
      fireEvent.click(await screen.findByRole('button', { name: /Monte Vettore/ }));
      fillWhen();
      submit();
      expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.overlap);
      expect(screen.queryByText(/Hike registered/)).not.toBeInTheDocument();
    });

    it('passes through a departure refused by the hut clock (422)', async () => {
      stub({ [HIKES_URL]: () => json({ message: TEXT.departurePast }, 422) });
      await openPage();
      fireEvent.click(await screen.findByRole('button', { name: /Monte Vettore/ }));
      fillWhen();
      submit();
      expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.departurePast);
    });

    it('offers to sign in again when the session has expired', async () => {
      stub({ [HIKES_URL]: () => json({ message: 'Not authenticated' }, 401) });
      await openPage();
      fireEvent.click(await screen.findByRole('button', { name: /Monte Vettore/ }));
      fillWhen();
      submit();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(TEXT.sessionExpired);
      expect(within(alert).getByRole('link', { name: 'sign in' })).toHaveAttribute(
        'href',
        '/login?next=%2Fhikes%2Fnew',
      );
    });

    it('shows a generic message for an unexpected error', async () => {
      stub({ [HIKES_URL]: () => json({ message: 'Internal' }, 500) });
      await openPage();
      fireEvent.click(await screen.findByRole('button', { name: /Monte Vettore/ }));
      fillWhen();
      submit();
      expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.failed);
    });
  });
});
