import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepeatWeeklyScheduleResult, SlotDetails } from '@mountain-hut/shared';
import { json, renderAt, sentBody, stubApi } from '../test/app.tsx';

// MH-09 R9: the "Repeat weekly schedule" dialog of /staff/slots.
const TEXT = {
  open: 'Repeat weekly schedule',
  dialog: 'Repeat weekly schedule',
  weeks: 'Number of weeks to repeat',
  confirm: 'Confirm and repeat schedule',
  cancel: 'Cancel',
  atLeastOne: 'Must be at least 1 week.',
  atMost: 'At most 12 weeks.',
  replaced: 'The slots already in those weeks are replaced.',
  sourceWeek: 'Wed 4 Nov – Tue 10 Nov',
  target2: 'Target: Wed 11 Nov – Tue 24 Nov',
  done2: 'Schedule successfully repeated across 2 weeks: 2 slots created.',
  done1Replaced: 'Schedule successfully repeated across 1 week: 1 slot created. 3 slots replaced.',
  conflict: 'The week starting 2026-11-11 has reservations: its schedule cannot be replaced',
  emptySource: 'Source week contains no time slots to repeat',
  sessionExpired: 'The session has expired. Please log in again.',
} as const;

const employee = { id: 2, email: 'employee@hut.test', role: 'EMPLOYEE' };
const warden = { id: 3, email: 'warden@hut.test', role: 'WARDEN' };
const hiker = { id: 1, email: 'hiker@example.test', role: 'HIKER' };

const SCHEDULE_URL = '/api/slots/schedule?date=2026-11-04';
const REPEAT_URL = '/api/slots/repeat-weekly';

const lunch: SlotDetails = {
  id: 1,
  date: '2026-11-04',
  startTime: '12:00',
  endTime: '13:30',
  tables: [
    { tableNumber: 1, seats: 4 },
    { tableNumber: 2, seats: 6 },
  ],
  totalSeats: 10,
};

const result = (over: Partial<RepeatWeeklyScheduleResult> = {}): RepeatWeeklyScheduleResult => ({
  targetWeeks: 2,
  createdSlotsCount: 2,
  replacedSlotsCount: 0,
  createdSlots: [
    { ...lunch, id: 10, date: '2026-11-11' },
    { ...lunch, id: 11, date: '2026-11-18' },
  ],
  ...over,
});

function stub(user: unknown = employee, repeat: () => Response = () => json(result(), 201)) {
  return stubApi({
    '/api/auth/me': () => json(user),
    [SCHEDULE_URL]: () => json([lunch]),
    [REPEAT_URL]: repeat,
  });
}

async function openDialog() {
  renderAt('/staff/slots');
  fireEvent.click(await screen.findByRole('button', { name: TEXT.open }));
  return screen.getByRole('dialog', { name: TEXT.dialog });
}

const repeatCalls = (fetchMock: ReturnType<typeof stub>) =>
  fetchMock.mock.calls.filter(([url]) => url === REPEAT_URL);

describe('MH-09 Repeat weekly schedule dialog', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not offer the repeat to hikers', async () => {
    stub(hiker);
    renderAt('/staff/slots');

    expect(await screen.findByText('This page is for the hut staff.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: TEXT.open })).not.toBeInTheDocument();
  });

  it('offers the repeat to wardens too', async () => {
    stub(warden);
    renderAt('/staff/slots');

    expect(await screen.findByRole('button', { name: TEXT.open })).toBeInTheDocument();
  });

  it('shows the source week, the replacement warning and focuses the number of weeks', async () => {
    stub();
    const dialog = await openDialog();

    expect(within(dialog).getByText(TEXT.sourceWeek)).toBeInTheDocument();
    expect(dialog).toHaveTextContent(TEXT.replaced);
    expect(within(dialog).getByLabelText(TEXT.weeks)).toHaveFocus();
    expect(within(dialog).getByLabelText(TEXT.weeks)).toHaveValue(1);
  });

  it('shows the target weeks for the number typed', async () => {
    stub();
    const dialog = await openDialog();

    fireEvent.change(within(dialog).getByLabelText(TEXT.weeks), { target: { value: '2' } });
    expect(within(dialog).getByText(TEXT.target2)).toBeInTheDocument();
  });

  it.each([
    ['0', TEXT.atLeastOne],
    ['-1', TEXT.atLeastOne],
    ['', TEXT.atLeastOne],
    ['13', TEXT.atMost],
    ['1.5', 'Enter a whole number of weeks.'],
  ])('rejects %j weeks without calling the API', async (weeks, message) => {
    const fetchMock = stub();
    const dialog = await openDialog();

    const input = within(dialog).getByLabelText(TEXT.weeks);
    fireEvent.change(input, { target: { value: weeks } });
    fireEvent.click(within(dialog).getByRole('button', { name: TEXT.confirm }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(repeatCalls(fetchMock)).toHaveLength(0);
  });

  it('accepts the maximum of 12 weeks', async () => {
    const fetchMock = stub(employee, () => json(result({ targetWeeks: 12 }), 201));
    const dialog = await openDialog();

    fireEvent.change(within(dialog).getByLabelText(TEXT.weeks), { target: { value: '12' } });
    fireEvent.click(within(dialog).getByRole('button', { name: TEXT.confirm }));

    expect(await screen.findByRole('status')).toHaveTextContent('across 12 weeks');
    expect(sentBody(fetchMock, REPEAT_URL)).toEqual({
      sourceStartDate: '2026-11-04',
      repeatWeeks: 12,
    });
  });

  it('repeats the week of the chosen day, closes and confirms', async () => {
    const fetchMock = stub();
    const dialog = await openDialog();

    fireEvent.change(within(dialog).getByLabelText(TEXT.weeks), { target: { value: '2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: TEXT.confirm }));

    expect(await screen.findByRole('status')).toHaveTextContent(TEXT.done2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sentBody(fetchMock, REPEAT_URL)).toEqual({
      sourceStartDate: '2026-11-04',
      repeatWeeks: 2,
    });
    const init = repeatCalls(fetchMock)[0]?.[1];
    expect(init?.method).toBe('POST');
  });

  it('says how many slots were replaced', async () => {
    stub(employee, () =>
      json(result({ targetWeeks: 1, createdSlotsCount: 1, replacedSlotsCount: 3 }), 201),
    );
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: TEXT.confirm }));

    expect(await screen.findByRole('status')).toHaveTextContent(TEXT.done1Replaced);
  });

  it('refreshes the schedule after the repeat', async () => {
    const fetchMock = stub();
    const dialog = await openDialog();
    const scheduleCalls = () => fetchMock.mock.calls.filter(([u]) => u === SCHEDULE_URL).length;
    const before = scheduleCalls();

    fireEvent.click(within(dialog).getByRole('button', { name: TEXT.confirm }));

    await screen.findByRole('status');
    await vi.waitFor(() => expect(scheduleCalls()).toBeGreaterThan(before));
  });

  it.each([
    [409, TEXT.conflict, TEXT.conflict],
    [422, TEXT.emptySource, TEXT.emptySource],
    [401, 'Not authenticated', TEXT.sessionExpired],
  ])('keeps the dialog open and explains a %i', async (status, message, shown) => {
    stub(employee, () => json({ message }, status));
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: TEXT.confirm }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(shown);
    expect(screen.getByRole('dialog', { name: TEXT.dialog })).toBeInTheDocument();
  });

  it.each([
    ['the Cancel button', () => fireEvent.click(screen.getByRole('button', { name: TEXT.cancel }))],
    ['the close button', () => fireEvent.click(screen.getByRole('button', { name: 'Close' }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
  ])('closes with %s without calling the API', async (_how, close) => {
    const fetchMock = stub();
    await openDialog();

    close();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(repeatCalls(fetchMock)).toHaveLength(0);
  });
});
