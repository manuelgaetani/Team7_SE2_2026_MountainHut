import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyBooking, SlotSummary } from '@mountain-hut/shared';
import { json, renderAt, stubApi, user } from '../test/app.tsx';

const TEXT = {
  modify: 'Modify booking of Saturday 21 November 2026',
  title: 'Modify booking',
  date: 'Date',
  time: 'Time',
  people: 'Number of people',
  requirement: (n: number) => `Requirement ${n}`,
  allergies: (n: number) => `Allergies, requirement ${n}`,
  remove: (n: number) => `Remove requirement ${n}`,
  add: '+ Add a requirement',
  emptyRequirement: 'Describe the requirement or remove it.',
  confirm: 'Confirm changes',
  cancel: 'Cancel',
  close: 'Close',
  loading: 'Loading time slots…',
  slotsFailed: 'Time slots could not be loaded. Please try again.',
  cutoff:
    'Changes are admitted up to 48 hours before the booked date, and a new time must start at least 48 hours from now.',
  peopleError: 'Enter a whole number of people, at least 1.',
  requirementError: 'A requirement can be at most 500 characters.',
  unchanged: 'Nothing has changed: the booking is the same as before.',
  saving: 'Saving changes…',
  updated: "Booking updated. We'll email you the new details.",
  sessionExpired: 'The session has expired. Please log in again.',
  changeFailed: 'The booking could not be changed. Please try again.',
  chooseTime: 'Choose a time.',
} as const;

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

const slots: SlotSummary[] = [
  slot({ id: 10, date: '2026-11-21', startTime: '12:30', availability: 'FULL', freeSeats: 0 }),
  slot({ id: 11, date: '2026-11-21', startTime: '19:00', availability: 'FULL', freeSeats: 0 }),
  slot({ id: 20, date: '2026-11-29', startTime: '12:00', availability: 'FULL', freeSeats: 0 }),
  slot({ id: 21, date: '2026-11-29', startTime: '13:00' }),
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
  return screen.getByRole('dialog', { name: TEXT.title });
}

const select = (label: string) => screen.getByLabelText<HTMLSelectElement>(label);
const confirm = () => fireEvent.click(screen.getByRole('button', { name: TEXT.confirm }));

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
    expect(await screen.findByLabelText(TEXT.date)).toHaveValue('2026-11-21');
    expect(select(TEXT.time)).toHaveValue('10');
    expect(screen.getByLabelText(TEXT.people)).toHaveValue(4);
    expect(screen.getByLabelText(TEXT.requirement(1))).toHaveValue('1 vegan, peanut allergy');
    expect(screen.getByLabelText(TEXT.allergies(1))).toBeChecked();
    expect(screen.getByLabelText(TEXT.requirement(2))).toHaveValue('2 vegetarians');
    expect(screen.getByLabelText(TEXT.allergies(2))).not.toBeChecked();
  });

  it('offers the dates of the upcoming slots', async () => {
    setup();
    await openDialog();
    const options = within(await screen.findByLabelText(TEXT.date)).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Saturday 21 November 2026',
      'Sunday 29 November 2026',
    ]);
  });

  it('keeps the slot of the booking selectable and disables the unavailable ones', async () => {
    setup();
    await openDialog();
    await screen.findByLabelText(TEXT.time);
    const [current, other] = within(select(TEXT.time)).getAllByRole<HTMLOptionElement>('option');
    expect(current).toHaveTextContent('12:30');
    expect(current.disabled).toBe(false);
    expect(other).toHaveTextContent('19:00 (full)');
    expect(other.disabled).toBe(true);
  });

  it('disables another slot that starts in less than 48 hours', async () => {
    // 2026-11-16 19:00 is 31 hours after the fixed now: it has seats but the API would refuse it.
    setup(() => json([...slots, slot({ id: 30, date: '2026-11-16', startTime: '19:00' })]));
    await openDialog();
    fireEvent.change(await screen.findByLabelText(TEXT.date), {
      target: { value: '2026-11-16' },
    });
    const soon = within(select(TEXT.time)).getByRole<HTMLOptionElement>('option', {
      name: '19:00 (within 48 hours)',
    });
    expect(soon.disabled).toBe(true);
    expect(select(TEXT.time)).toHaveValue('');
  });

  it('chooses the first available time of a new date', async () => {
    setup();
    await openDialog();
    fireEvent.change(await screen.findByLabelText(TEXT.date), {
      target: { value: '2026-11-29' },
    });
    expect(select(TEXT.time)).toHaveValue('21');
  });

  it('shows a loading status while the slots arrive', async () => {
    setup();
    await openDialog();
    expect(screen.getByRole('status')).toHaveTextContent(TEXT.loading);
  });

  it('says when the slots cannot be loaded', async () => {
    setup(() => json({}, 500));
    await openDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.slotsFailed);
  });

  it.each(['0', '-2', '2.5', ''])('rejects %j people', async (value) => {
    setup();
    await openDialog();
    const people = screen.getByLabelText(TEXT.people);
    fireEvent.change(people, { target: { value } });
    confirm();
    expect(await screen.findByText(TEXT.peopleError)).toHaveAttribute('role', 'alert');
    expect(people).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects a requirement longer than 500 characters', async () => {
    setup();
    await openDialog();
    const requirement = screen.getByLabelText(TEXT.requirement(2));
    fireEvent.change(requirement, { target: { value: 'a'.repeat(501) } });
    confirm();
    expect(await screen.findByText(TEXT.requirementError)).toBeVisible();
    expect(requirement).toHaveAttribute('aria-invalid', 'true');
  });

  it('accepts a requirement of exactly 500 characters', async () => {
    setup();
    await openDialog();
    fireEvent.change(screen.getByLabelText(TEXT.requirement(2)), {
      target: { value: 'a'.repeat(500) },
    });
    confirm();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('adds a requirement with its own allergies flag', async () => {
    setup();
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: TEXT.add }));
    const added = screen.getByLabelText(TEXT.requirement(3));
    expect(added).toHaveValue('');
    fireEvent.change(added, { target: { value: '1 shellfish allergy' } });
    fireEvent.click(screen.getByLabelText(TEXT.allergies(3)));
    expect(screen.getByLabelText(TEXT.allergies(3))).toBeChecked();
    expect(screen.getByLabelText(TEXT.allergies(2))).not.toBeChecked();
  });

  it('asks to describe or remove an empty requirement', async () => {
    setup();
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: TEXT.add }));
    fireEvent.change(screen.getByLabelText(TEXT.requirement(3)), { target: { value: '   ' } });
    confirm();
    expect(await screen.findByText(TEXT.emptyRequirement)).toBeVisible();
    expect(screen.getByLabelText(TEXT.requirement(3))).toHaveAttribute('aria-invalid', 'true');
  });

  it('removes a requirement', async () => {
    setup();
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: TEXT.remove(1) }));
    expect(screen.getByLabelText(TEXT.requirement(1))).toHaveValue('2 vegetarians');
    expect(screen.queryByLabelText(TEXT.requirement(2))).not.toBeInTheDocument();
  });

  it('stops adding requirements at 20', async () => {
    setup();
    await openDialog();
    const add = screen.getByRole('button', { name: TEXT.add });
    for (let i = 0; i < 18; i++) fireEvent.click(add);
    expect(screen.getByLabelText(TEXT.requirement(20))).toBeInTheDocument();
    expect(add).toBeDisabled();
  });

  it.each([
    ['ticking an allergies flag', () => fireEvent.click(screen.getByLabelText(TEXT.allergies(2)))],
    [
      'removing a requirement',
      () => fireEvent.click(screen.getByRole('button', { name: TEXT.remove(2) })),
    ],
  ])('counts %s as a change', async (_name, change) => {
    setup();
    await openDialog();
    await screen.findByLabelText(TEXT.date);
    change();
    confirm();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not count spaces around a requirement as a change', async () => {
    setup();
    await openDialog();
    await screen.findByLabelText(TEXT.date);
    fireEvent.change(screen.getByLabelText(TEXT.requirement(2)), {
      target: { value: '  2 vegetarians  ' },
    });
    confirm();
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.unchanged);
  });

  it('asks to change something before confirming', async () => {
    setup();
    await openDialog();
    await screen.findByLabelText(TEXT.date);
    confirm();
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.unchanged);
  });

  it('sends only the number of people when only that changes', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.change(screen.getByLabelText(TEXT.people), { target: { value: '6' } });
    confirm();
    await waitFor(() => expect(changeCalls(fetchMock)).toHaveLength(1));
    expect(sentChange(fetchMock)).toEqual({ partySize: 6 });
  });

  it('sends the new slot when the date or the time changes', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.change(await screen.findByLabelText(TEXT.date), {
      target: { value: '2026-11-29' },
    });
    confirm();
    await waitFor(() => expect(changeCalls(fetchMock)).toHaveLength(1));
    expect(sentChange(fetchMock)).toEqual({ slotId: 21 });
  });

  it('sends the whole list of requirements when one of them changes', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: TEXT.add }));
    fireEvent.change(screen.getByLabelText(TEXT.requirement(3)), {
      target: { value: ' 1 shellfish allergy ' },
    });
    fireEvent.click(screen.getByLabelText(TEXT.allergies(3)));
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
    fireEvent.change(screen.getByLabelText(TEXT.people), { target: { value: '0' } });
    confirm();
    await screen.findByText(TEXT.peopleError);
    expect(changeCalls(fetchMock)).toHaveLength(0);
  });

  it('closes, says the booking is updated and reloads the bookings', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.change(screen.getByLabelText(TEXT.people), { target: { value: '6' } });
    confirm();
    expect(await screen.findByText(TEXT.updated)).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/bookings/me')).toHaveLength(2),
    );
  });

  it('disables the button while the change is being saved', async () => {
    const fetchMock = setup();
    await openDialog();
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    fireEvent.change(screen.getByLabelText(TEXT.people), { target: { value: '6' } });
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
    fireEvent.change(screen.getByLabelText(TEXT.people), { target: { value: '6' } });
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
    fireEvent.change(screen.getByLabelText(TEXT.people), { target: { value: '6' } });
    confirm();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it.each([
    ['the close button', () => fireEvent.click(screen.getByRole('button', { name: TEXT.close }))],
    [
      'the cancel button',
      () =>
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', { name: TEXT.cancel }),
        ),
    ],
    ['the Escape key', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['a click outside', () => fireEvent.click(screen.getByRole('presentation'))],
  ])('closes with %s', async (_name, close) => {
    setup();
    await openDialog();
    close();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays open when clicking inside', async () => {
    setup();
    const dialog = await openDialog();
    fireEvent.click(dialog);
    expect(screen.getByRole('dialog')).toBeVisible();
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

  it('displays too-late slots as disabled with the (too late) note', async () => {
    setup(() =>
      json([
        ...slots,
        slot({ id: 31, date: '2026-11-29', startTime: '14:00', availability: 'TOO_LATE' }),
      ]),
    );
    await openDialog();
    fireEvent.change(await screen.findByLabelText(TEXT.date), {
      target: { value: '2026-11-29' },
    });
    const tooLate = within(select(TEXT.time)).getByRole<HTMLOptionElement>('option', {
      name: '14:00 (too late)',
    });
    expect(tooLate.disabled).toBe(true);
  });

  it('asks to choose a time when no slot is selectable on the chosen date', async () => {
    const fetchMock = setup(() =>
      json([...slots, slot({ id: 30, date: '2026-11-16', startTime: '19:00' })]),
    );
    await openDialog();
    fireEvent.change(await screen.findByLabelText(TEXT.date), {
      target: { value: '2026-11-16' },
    });
    expect(select(TEXT.time)).toHaveValue('');
    confirm();
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.chooseTime);
    expect(changeCalls(fetchMock)).toHaveLength(0);
  });

  it('allows changing the time select between available slots and clears prior form errors', async () => {
    const fetchMock = setup(() =>
      json([...slots, slot({ id: 22, date: '2026-11-29', startTime: '19:30' })]),
    );
    await openDialog();
    await screen.findByLabelText(TEXT.date);
    confirm();
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.unchanged);

    fireEvent.change(screen.getByLabelText(TEXT.date), { target: { value: '2026-11-29' } });
    fireEvent.change(select(TEXT.time), { target: { value: '22' } });
    expect(select(TEXT.time)).toHaveValue('22');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    confirm();
    await waitFor(() => expect(changeCalls(fetchMock)).toHaveLength(1));
    expect(sentChange(fetchMock)).toEqual({ slotId: 22 });
  });

  it('restores the booked slot when switching away from and back to the booked date', async () => {
    setup();
    await openDialog();
    fireEvent.change(await screen.findByLabelText(TEXT.date), {
      target: { value: '2026-11-29' },
    });
    expect(select(TEXT.time)).toHaveValue('21');

    fireEvent.change(screen.getByLabelText(TEXT.date), { target: { value: '2026-11-21' } });
    expect(select(TEXT.time)).toHaveValue('10');
  });

  it('sends an empty requirements array when all requirements are removed', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.click(screen.getByRole('button', { name: TEXT.remove(1) }));
    fireEvent.click(screen.getByRole('button', { name: TEXT.remove(1) }));
    confirm();
    await waitFor(() => expect(changeCalls(fetchMock)).toHaveLength(1));
    expect(sentChange(fetchMock)).toEqual({ requirements: [] });
  });

  it('sends slotId, partySize, and requirements together when all three change', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.change(await screen.findByLabelText(TEXT.date), {
      target: { value: '2026-11-29' },
    });
    fireEvent.change(screen.getByLabelText(TEXT.people), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: TEXT.remove(2) }));
    confirm();
    await waitFor(() => expect(changeCalls(fetchMock)).toHaveLength(1));
    expect(sentChange(fetchMock)).toEqual({
      slotId: 21,
      partySize: 6,
      requirements: [{ allergies: true, description: '1 vegan, peanut allergy' }],
    });
  });

  it('clears form error when adding, editing, or removing a requirement', async () => {
    setup();
    await openDialog();
    await screen.findByLabelText(TEXT.date);

    confirm();
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.unchanged);
    fireEvent.click(screen.getByRole('button', { name: TEXT.add }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: TEXT.remove(3) }));
    confirm();
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.unchanged);
    fireEvent.change(screen.getByLabelText(TEXT.requirement(2)), {
      target: { value: 'vegan' },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reloads both bookings and slots caches after a successful change', async () => {
    const fetchMock = setup();
    await openDialog();
    fireEvent.change(screen.getByLabelText(TEXT.people), { target: { value: '6' } });
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
    fireEvent.change(screen.getByLabelText(TEXT.people), { target: { value: '6' } });
    confirm();
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.changeFailed);
  });
});
