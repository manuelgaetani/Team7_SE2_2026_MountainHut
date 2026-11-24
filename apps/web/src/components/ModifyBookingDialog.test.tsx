import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyBooking, SlotSummary } from '@mountain-hut/shared';
import { json, renderAt, stubApi, user } from '../test/app.tsx';

const TEXT = {
  modify: 'Modify booking of Saturday 21 November 2026',
  title: 'Modify booking',
  people: 'Number of people',
  more: 'More guests',
  fewer: 'Fewer guests',
  add: 'Add another requirement',
  emptyRequirement: 'Describe the requirement or remove it.',
  confirm: 'Confirm changes',
  close: 'Close',
  discardTitle: 'Discard your changes?',
  keep: 'Keep editing',
  discard: 'Discard',
  loading: 'Loading time slots…',
  slotsFailed: 'Time slots could not be loaded. Please try again.',
  cutoff:
    'Changes are admitted up to 48 hours before the booked date, and a new time must start at least 48 hours from now.',
  requirementError: 'A requirement can be at most 500 characters.',
  unchanged: 'Nothing has changed: the booking is the same as before.',
  saving: 'Saving changes…',
  updated: "Booking updated. We'll email you the new details.",
  sessionExpired: 'The session has expired. Please sign in again.',
  changeFailed: 'The booking could not be changed. Please try again.',
  chooseTime: 'Choose a time.',
} as const;

const DAY = { first: 'Sat 21 Nov', second: 'Sun 29 Nov', soon: 'Mon 16 Nov' } as const;

const CHANGE_URL = '/api/bookings/1';

const booking: MyBooking = {
  id: 1,
  slotId: 10,
  date: '2026-11-21',
  startTime: '12:30',
  endTime: '14:00',
  partySize: 4,
  requirements: [
    { allergies: true, description: '1 vegan, peanut allergy' },
    { allergies: false, description: '2 vegetarians' },
  ],
  status: 'CONFIRMED',
};

const slot = (s: Partial<SlotSummary> & Pick<SlotSummary, 'id' | 'date' | 'startTime'>) => ({
  endTime: '23:00',
  freeSeats: 10,
  availability: 'AVAILABLE' as const,
  ...s,
});

// The slot of the booking has 2 free seats: with its own 4 the party can grow up to 6.
const slots: SlotSummary[] = [
  slot({ id: 10, date: '2026-11-21', startTime: '12:30', freeSeats: 2 }),
  slot({ id: 11, date: '2026-11-21', startTime: '19:00', availability: 'FULL', freeSeats: 0 }),
  slot({ id: 20, date: '2026-11-29', startTime: '12:00', availability: 'FULL', freeSeats: 0 }),
  slot({ id: 21, date: '2026-11-29', startTime: '13:00', freeSeats: 5 }),
];

function setup(
  slotsResponse: () => Response = () => json(slots),
  changeResponse: () => Response = () => json({ id: 1, status: 'CONFIRMED' }),
) {
  return stubApi({
    '/api/auth/me': () => json(user),
    '/api/bookings/me': () => json([booking]),
    '/api/slots': slotsResponse,
    [CHANGE_URL]: changeResponse,
  });
}

const changeCalls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([url]) => url === CHANGE_URL);

const sentChange = (fetchMock: ReturnType<typeof stubApi>): unknown => {
  const [, init] = changeCalls(fetchMock)[0];
  expect(init?.method).toBe('PATCH');
  return JSON.parse(init?.body as string);
};

async function openDialog() {
  renderAt('/bookings');
  fireEvent.click(await screen.findByRole('button', { name: TEXT.modify }));
  const dialog = screen.getByRole('dialog', { name: TEXT.title });
  // Wait for the slots: the pickers appear with them.
  await within(dialog).findByRole('radiogroup', { name: 'Time' });
  return dialog;
}

const confirm = () => fireEvent.click(screen.getByRole('button', { name: TEXT.confirm }));
const day = (name: string) => screen.getByRole('radio', { name });
const time = (start: string) => screen.getByRole('radio', { name: new RegExp(`^${start}–`) });
const partySize = () => screen.getByLabelText(TEXT.people);
const more = () => screen.getByRole('button', { name: TEXT.more });
const fewer = () => screen.getByRole('button', { name: TEXT.fewer });
const row = (n: number) => within(screen.getAllByTestId('requirement-row')[n - 1]);
const details = (n: number) => row(n).getByLabelText('Details');
const allergies = (n: number) => row(n).getByRole('checkbox', { name: 'Allergies' });
const remove = (n: number) => row(n).getByRole('button', { name: 'Remove' });
// The dialog has two Close buttons: the x in the corner and the one in the action row.
const actionRow = () => {
  const el = document.querySelector<HTMLElement>('.modify-dialog__actions');
  if (!el) throw new Error('No action row');
  return within(el);
};
const clickClose = () => fireEvent.click(actionRow().getByRole('button', { name: TEXT.close }));
const clickCross = () => fireEvent.click(screen.getAllByRole('button', { name: TEXT.close })[0]);

describe('ModifyBookingDialog', () => {
  // The bookings and slots below are days after this moment, beyond the 48-hour rule of MH-06.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 15, 12, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens from the Modify button of the booking', async () => {
    setup();
    const dialog = await openDialog();
    expect(within(dialog).getByRole('heading', { name: TEXT.title })).toBeVisible();
    expect(dialog).toHaveTextContent(TEXT.cutoff);
    expect(dialog).toHaveFocus();
  });

  it('starts from the current details of the booking', async () => {
    setup();
    await openDialog();
    expect(day(DAY.first)).toHaveAttribute('aria-checked', 'true');
    expect(time('12:30')).toHaveAttribute('aria-checked', 'true');
    expect(partySize()).toHaveTextContent('4');
    expect(details(1)).toHaveValue('1 vegan, peanut allergy');
    expect(allergies(1)).toBeChecked();
    expect(details(2)).toHaveValue('2 vegetarians');
    expect(allergies(2)).not.toBeChecked();
  });

  it('offers the dates of the upcoming slots as day radios', async () => {
    setup();
    await openDialog();
    const group = screen.getByRole('radiogroup', { name: 'Date' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual([DAY.first, DAY.second]);
  });

  it('keeps the slot of the booking choosable and disables the unavailable ones with a reason', async () => {
    setup();
    await openDialog();
    expect(time('12:30')).toBeEnabled();
    expect(time('12:30')).toHaveAccessibleName('12:30–23:00');
    expect(time('19:00')).toBeDisabled();
    expect(time('19:00')).toHaveAccessibleName('19:00–23:00 Full');
  });

  it('says Closed for a slot that is too late', async () => {
    setup(() =>
      json([
        ...slots,
        slot({ id: 31, date: '2026-11-21', startTime: '20:00', availability: 'TOO_LATE' }),
      ]),
    );
    await openDialog();
    expect(time('20:00')).toBeDisabled();
    expect(time('20:00')).toHaveAccessibleName('20:00–23:00 Closed');
  });

  it('disables another slot that starts in less than 48 hours', async () => {
    // 2026-11-16 19:00 is 31 hours after the fixed now: it has seats but the API would refuse it.
    setup(() => json([...slots, slot({ id: 30, date: '2026-11-16', startTime: '19:00' })]));
    await openDialog();
    fireEvent.click(day(DAY.soon));
    expect(time('19:00')).toBeDisabled();
    expect(time('19:00')).toHaveAccessibleName('19:00–23:00 Within 48 hours');
    expect(time('19:00')).toHaveAttribute('aria-checked', 'false');
  });

  it('chooses the first available time of a new date', async () => {
    setup();
    await openDialog();
    fireEvent.click(day(DAY.second));
    expect(time('13:00')).toHaveAttribute('aria-checked', 'true');
  });

  it('shows a loading status while the slots arrive', async () => {
    setup();
    renderAt('/bookings');
    fireEvent.click(await screen.findByRole('button', { name: TEXT.modify }));
    expect(screen.getByText(TEXT.loading)).toHaveAttribute('role', 'status');
  });

  it('says when the slots cannot be loaded', async () => {
    setup(() => json({}, 500));
    renderAt('/bookings');
    fireEvent.click(await screen.findByRole('button', { name: TEXT.modify }));
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.slotsFailed);
  });

  describe('number of people', () => {
    it('grows up to the free seats of the slot plus the own seats of the booking', async () => {
      setup();
      await openDialog();
      fireEvent.click(more());
      fireEvent.click(more());
      expect(partySize()).toHaveTextContent('6');
      expect(more()).toBeDisabled();
    });

    it('lets the party keep its size in its own full slot', async () => {
      setup(() =>
        json([
          slot({
            id: 10,
            date: '2026-11-21',
            startTime: '12:30',
            freeSeats: 0,
            availability: 'FULL',
          }),
        ]),
      );
      await openDialog();
      expect(partySize()).toHaveTextContent('4');
      expect(more()).toBeDisabled();
      fireEvent.click(fewer());
      expect(partySize()).toHaveTextContent('3');
      expect(more()).toBeEnabled();
    });

    it('limits the party to the free seats of another slot', async () => {
      setup();
      await openDialog();
      fireEvent.click(day(DAY.second));
      // The slot of the 29th has 5 free seats: the party of 4 may reach 5, not 6.
      fireEvent.click(more());
      expect(partySize()).toHaveTextContent('5');
      expect(more()).toBeDisabled();
    });

    it('brings the party down to the seats of a smaller slot', async () => {
      setup(() =>
        json([
          ...slots.slice(0, 2),
          slot({ id: 21, date: '2026-11-29', startTime: '13:00', freeSeats: 3 }),
        ]),
      );
      await openDialog();
      fireEvent.click(day(DAY.second));
      expect(partySize()).toHaveTextContent('3');
    });

    it('restores the party on going back to the booked slot', async () => {
      setup(() =>
        json([
          ...slots.slice(0, 2),
          slot({ id: 21, date: '2026-11-29', startTime: '13:00', freeSeats: 3 }),
        ]),
      );
      await openDialog();
      fireEvent.click(day(DAY.second));
      expect(partySize()).toHaveTextContent('3');
      fireEvent.click(day(DAY.first));
      expect(partySize()).toHaveTextContent('4');
    });

    it('cannot go below one person', async () => {
      setup();
      await openDialog();
      for (let i = 0; i < 5; i++) if (!fewer().hasAttribute('disabled')) fireEvent.click(fewer());
      expect(partySize()).toHaveTextContent('1');
      expect(fewer()).toBeDisabled();
    });
  });

  describe('requirements', () => {
    it('rejects a requirement longer than 500 characters under its row', async () => {
      setup();
      await openDialog();
      fireEvent.change(details(2), { target: { value: 'a'.repeat(501) } });
      confirm();
      expect(await row(2).findByText(TEXT.requirementError)).toBeVisible();
      expect(details(2)).toHaveAttribute('aria-invalid', 'true');
      expect(row(1).queryByRole('alert')).not.toBeInTheDocument();
    });

    it('accepts a requirement of exactly 500 characters', async () => {
      setup();
      await openDialog();
      fireEvent.change(details(2), { target: { value: 'a'.repeat(500) } });
      confirm();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('adds a requirement with its own allergies flag', async () => {
      setup();
      await openDialog();
      fireEvent.click(screen.getByRole('button', { name: TEXT.add }));
      expect(details(3)).toHaveValue('');
      fireEvent.change(details(3), { target: { value: '1 shellfish allergy' } });
      fireEvent.click(allergies(3));
      expect(allergies(3)).toBeChecked();
      expect(allergies(2)).not.toBeChecked();
    });

    it('asks to describe or remove an empty requirement, under the row', async () => {
      setup();
      await openDialog();
      fireEvent.click(screen.getByRole('button', { name: TEXT.add }));
      fireEvent.change(details(3), { target: { value: '   ' } });
      confirm();
      expect(await row(3).findByText(TEXT.emptyRequirement)).toBeVisible();
      expect(details(3)).toHaveAttribute('aria-invalid', 'true');
    });

    it('removes a requirement', async () => {
      setup();
      await openDialog();
      fireEvent.click(remove(1));
      expect(details(1)).toHaveValue('2 vegetarians');
      expect(screen.getAllByTestId('requirement-row')).toHaveLength(1);
    });

    it('stops adding requirements at 20', async () => {
      setup();
      await openDialog();
      for (let i = 0; i < 18; i++) fireEvent.click(screen.getByRole('button', { name: TEXT.add }));
      expect(screen.getAllByTestId('requirement-row')).toHaveLength(20);
      expect(screen.getByRole('button', { name: TEXT.add })).toBeDisabled();
    });

    it.each([
      ['ticking an allergies flag', () => fireEvent.click(allergies(2))],
      ['removing a requirement', () => fireEvent.click(remove(2))],
    ])('counts %s as a change', async (_name, change) => {
      setup();
      await openDialog();
      change();
      confirm();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not count spaces around a requirement as a change', async () => {
      setup();
      await openDialog();
      fireEvent.change(details(2), { target: { value: '  2 vegetarians  ' } });
      confirm();
      expect(screen.getByRole('alert')).toHaveTextContent(TEXT.unchanged);
    });
  });

  it('asks to change something before confirming', async () => {
    setup();
    await openDialog();
    confirm();
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.unchanged);
  });

  it('sends only the number of people when only that changes', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.click(more());
    fireEvent.click(more());
    confirm();
    await waitFor(() => expect(changeCalls(fetchMock)).toHaveLength(1));
    expect(sentChange(fetchMock)).toEqual({ partySize: 6 });
  });

  it('sends the new slot when the date or the time changes', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.click(day(DAY.second));
    confirm();
    await waitFor(() => expect(changeCalls(fetchMock)).toHaveLength(1));
    expect(sentChange(fetchMock)).toEqual({ slotId: 21 });
  });

  it('sends the whole list of requirements when one of them changes', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: TEXT.add }));
    fireEvent.change(details(3), { target: { value: ' 1 shellfish allergy ' } });
    fireEvent.click(allergies(3));
    confirm();
    await waitFor(() => expect(changeCalls(fetchMock)).toHaveLength(1));
    expect(sentChange(fetchMock)).toEqual({
      requirements: [
        { allergies: true, description: '1 vegan, peanut allergy' },
        { allergies: false, description: '2 vegetarians' },
        { allergies: true, description: '1 shellfish allergy' },
      ],
    });
  });

  it('sends nothing when the form is not valid', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: TEXT.add }));
    confirm();
    await screen.findByText(TEXT.emptyRequirement);
    expect(changeCalls(fetchMock)).toHaveLength(0);
  });

  it('closes, confirms with a toast and reloads the bookings', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.click(more());
    confirm();
    const toast = await screen.findByText(TEXT.updated);
    expect(toast.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/bookings/me')).toHaveLength(2),
    );
  });

  it('disables the button while the change is being saved', async () => {
    const fetchMock = setup();
    await openDialog();
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    fireEvent.click(more());
    confirm();
    expect(await screen.findByRole('button', { name: TEXT.saving })).toBeDisabled();
  });

  it.each([
    [422, 'Changes are only admitted up to 48 hours before the booked date'],
    [409, 'Insufficient seats available for the updated booking'],
    [404, 'Booking not found'],
    [403, 'You can only change your own bookings'],
  ])('shows the message of the API for a %i and stays open', async (status, message) => {
    setup(undefined, () => json({ message }, status));
    await openDialog();
    fireEvent.click(more());
    confirm();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByRole('button', { name: TEXT.confirm })).toBeEnabled();
  });

  it.each([
    [401, TEXT.sessionExpired],
    [500, TEXT.changeFailed],
    [400, TEXT.changeFailed],
  ])('shows a clear message for a %i', async (status, message) => {
    setup(undefined, () => json({ message: 'raw server message' }, status));
    await openDialog();
    fireEvent.click(more());
    confirm();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('links the expired session notice to sign in and back to this page', async () => {
    setup(undefined, () => json({}, 401));
    await openDialog();
    fireEvent.click(more());
    confirm();
    const link = await within(await screen.findByRole('alert')).findByRole('link', {
      name: 'sign in',
    });
    expect(link).toHaveAttribute('href', '/login?next=%2Fbookings');
  });

  describe('closing', () => {
    it.each([
      ['the Close button', () => clickClose()],
      ['the x button', () => clickCross()],
      ['the Escape key', () => fireEvent.keyDown(document, { key: 'Escape' })],
      ['a click outside', () => fireEvent.click(screen.getByRole('presentation'))],
    ])('closes with %s when nothing was edited', async (_name, close) => {
      setup();
      await openDialog();
      close();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText(TEXT.discardTitle)).not.toBeInTheDocument();
    });

    it.each([
      ['the Close button', () => clickClose()],
      ['the x button', () => clickCross()],
      ['the Escape key', () => fireEvent.keyDown(document, { key: 'Escape' })],
      ['a click outside', () => fireEvent.click(screen.getByRole('presentation'))],
    ])('asks to discard the edits when closing with %s', async (_name, close) => {
      setup();
      await openDialog();
      fireEvent.click(more());
      close();
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(TEXT.discardTitle)).toBeVisible();
      expect(within(dialog).getByRole('button', { name: TEXT.keep })).toHaveFocus();
      expect(within(dialog).getByRole('button', { name: TEXT.discard })).toBeVisible();
      expect(screen.queryByRole('button', { name: TEXT.confirm })).not.toBeInTheDocument();
    });

    it('keeps the edits on Keep editing', async () => {
      setup();
      await openDialog();
      fireEvent.click(more());
      clickClose();
      fireEvent.click(screen.getByRole('button', { name: TEXT.keep }));
      expect(screen.queryByText(TEXT.discardTitle)).not.toBeInTheDocument();
      expect(partySize()).toHaveTextContent('5');
      expect(screen.getByRole('button', { name: TEXT.confirm })).toBeVisible();
    });

    it('keeps the edits when Escape is pressed on the prompt', async () => {
      setup();
      await openDialog();
      fireEvent.click(more());
      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByRole('dialog')).toBeVisible();
      expect(screen.queryByText(TEXT.discardTitle)).not.toBeInTheDocument();
    });

    it('closes on Discard', async () => {
      setup();
      await openDialog();
      fireEvent.click(more());
      clickClose();
      fireEvent.click(screen.getByRole('button', { name: TEXT.discard }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes without asking when an edit is reverted', async () => {
      setup();
      await openDialog();
      fireEvent.click(more());
      fireEvent.click(fewer());
      fireEvent.click(remove(2));
      fireEvent.click(screen.getByRole('button', { name: TEXT.add }));
      fireEvent.change(details(2), { target: { value: '2 vegetarians' } });
      clickClose();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('stays open when clicking inside', async () => {
      setup();
      const dialog = await openDialog();
      fireEvent.click(dialog);
      expect(screen.getByRole('dialog')).toBeVisible();
    });
  });

  it('exposes accessible modal attributes and stays open on non-Escape keys', async () => {
    setup();
    const dialog = await openDialog();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'modify-dialog-title');

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('asks to choose a time when no slot is selectable on the chosen date', async () => {
    const fetchMock = setup(() =>
      json([...slots, slot({ id: 30, date: '2026-11-16', startTime: '19:00' })]),
    );
    await openDialog();
    fireEvent.click(day(DAY.soon));
    confirm();
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.chooseTime);
    expect(changeCalls(fetchMock)).toHaveLength(0);
  });

  it('allows changing the time between available slots and clears prior form errors', async () => {
    const fetchMock = setup(() =>
      json([...slots, slot({ id: 22, date: '2026-11-29', startTime: '19:30', freeSeats: 5 })]),
    );
    await openDialog();
    confirm();
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.unchanged);

    fireEvent.click(day(DAY.second));
    fireEvent.click(time('19:30'));
    expect(time('19:30')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    confirm();
    await waitFor(() => expect(changeCalls(fetchMock)).toHaveLength(1));
    expect(sentChange(fetchMock)).toEqual({ slotId: 22 });
  });

  it('restores the booked slot when switching away from and back to the booked date', async () => {
    setup();
    await openDialog();
    fireEvent.click(day(DAY.second));
    expect(time('13:00')).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(day(DAY.first));
    expect(time('12:30')).toHaveAttribute('aria-checked', 'true');
  });

  it('sends an empty requirements array when all requirements are removed', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.click(remove(1));
    fireEvent.click(remove(1));
    confirm();
    await waitFor(() => expect(changeCalls(fetchMock)).toHaveLength(1));
    expect(sentChange(fetchMock)).toEqual({ requirements: [] });
  });

  it('sends slotId, partySize, and requirements together when all three change', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.click(day(DAY.second));
    fireEvent.click(more());
    fireEvent.click(remove(2));
    confirm();
    await waitFor(() => expect(changeCalls(fetchMock)).toHaveLength(1));
    expect(sentChange(fetchMock)).toEqual({
      slotId: 21,
      partySize: 5,
      requirements: [{ allergies: true, description: '1 vegan, peanut allergy' }],
    });
  });

  it('clears form error when adding, editing, or removing a requirement', async () => {
    setup();
    await openDialog();

    confirm();
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.unchanged);
    fireEvent.click(screen.getByRole('button', { name: TEXT.add }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(remove(3));
    confirm();
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.unchanged);
    fireEvent.change(details(2), { target: { value: 'vegan' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reloads both bookings and slots caches after a successful change', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.click(more());
    confirm();
    await screen.findByText(TEXT.updated);
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/bookings/me')).toHaveLength(2);
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/slots')).toHaveLength(2);
    });
  });

  it('shows generic fallback message on a non-ApiError network failure', async () => {
    stubApi({
      '/api/auth/me': () => json(user),
      '/api/bookings/me': () => json([booking]),
      '/api/slots': () => json(slots),
      [CHANGE_URL]: () => {
        throw new Error('Network unreachable');
      },
    });
    await openDialog();
    fireEvent.click(more());
    confirm();
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.changeFailed);
  });
});
