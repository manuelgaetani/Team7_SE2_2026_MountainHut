import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyBooking } from '@mountain-hut/shared';
import { json, renderAt, stubApi, user } from '../test/app.tsx';

const TEXT = {
  title: 'My bookings',
  loading: 'Loading your bookings…',
  logIn: 'Log in',
  staff: 'Staff accounts have no bookings.',
  upcoming: 'Upcoming',
  cancelled: 'Cancelled',
  noUpcoming: /You have no upcoming bookings\./,
  noCancelled: 'You have no cancelled bookings.',
  bookTable: 'Book a table',
  sessionExpired: 'The session has expired. Please log in again.',
  loadFailed: 'Your bookings could not be loaded. Please try again.',
  pendingNote: "We'll email you as soon as the request is confirmed.",
  locked:
    'This booking can no longer be changed: changes are admitted up to 48 hours before the booked date.',
} as const;

const confirmed: MyBooking = {
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
const pending: MyBooking = {
  id: 2,
  slotId: 11,
  date: '2026-12-06',
  startTime: '13:00',
  endTime: '14:30',
  partySize: 1,
  requirements: [],
  status: 'PENDING',
};
const cancelled: MyBooking = { ...confirmed, id: 3, date: '2026-11-29', status: 'CANCELLED' };

const asHiker = (bookings: () => Response) =>
  stubApi({ '/api/auth/me': () => json(user), '/api/bookings/me': bookings });

const card = (title: string) => screen.getByRole('article', { name: title });

describe('MyBookingsPage', () => {
  // The bookings and slots below are days after this moment, beyond the 48-hour rule of MH-06.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 15, 12, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks visitors without a session to log in', async () => {
    stubApi();
    renderAt('/bookings');
    expect(await screen.findByRole('link', { name: TEXT.logIn })).toHaveAttribute('href', '/login');
  });

  it.each(['EMPLOYEE', 'WARDEN'])(
    'tells a %s that staff accounts have no bookings',
    async (role) => {
      const fetchMock = stubApi({ '/api/auth/me': () => json({ ...user, role }) });
      renderAt('/bookings');
      expect(await screen.findByText(TEXT.staff)).toBeVisible();
      expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('/api/bookings/me');
    },
  );

  it('shows a loading status while the bookings arrive', async () => {
    stubApi({
      '/api/auth/me': () => json(user),
      '/api/bookings/me': () => json([]),
    });
    renderAt('/bookings');
    expect(await screen.findByRole('status')).toHaveTextContent(TEXT.loading);
  });

  it('lists the upcoming bookings with date, time, party and status', async () => {
    asHiker(() => json([confirmed, pending]));
    renderAt('/bookings');

    expect(await screen.findByRole('heading', { name: TEXT.title })).toBeVisible();
    const first = await screen.findByRole('article', { name: 'Saturday 21 November 2026' });
    expect(first).toHaveTextContent('Nov21');
    expect(first).toHaveTextContent('12:30 · 4 people');
    expect(first).toHaveTextContent('Confirmed');
    const requirements = within(first).getAllByRole('listitem');
    expect(requirements.map((li) => li.textContent)).toEqual([
      'Allergies1 vegan, peanut allergy',
      '2 vegetarians',
    ]);

    const second = card('Sunday 6 December 2026');
    expect(second).toHaveTextContent('Dec06');
    expect(second).toHaveTextContent('13:00 · 1 person');
    expect(second).toHaveTextContent('Awaiting confirmation');
    expect(second).toHaveTextContent(TEXT.pendingNote);
  });

  it('keeps the order of the API, the soonest first', async () => {
    asHiker(() => json([confirmed, pending]));
    renderAt('/bookings');
    await screen.findAllByRole('article');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Saturday 21 November 2026',
      'Sunday 6 December 2026',
    ]);
  });

  it('offers modify and cancel on every active booking', async () => {
    asHiker(() => json([confirmed]));
    renderAt('/bookings');
    const article = await screen.findByRole('article', { name: 'Saturday 21 November 2026' });
    expect(
      within(article).getByRole('button', { name: 'Modify booking of Saturday 21 November 2026' }),
    ).toBeEnabled();
    expect(
      within(article).getByRole('button', { name: 'Cancel booking of Saturday 21 November 2026' }),
    ).toBeEnabled();
  });

  it('blocks the change of a booking less than 48 hours away, and says why', async () => {
    // 2026-11-16 12:30 is 24 and a half hours after the fixed now.
    asHiker(() => json([{ ...confirmed, date: '2026-11-16' }]));
    renderAt('/bookings');
    const article = await screen.findByRole('article', { name: 'Monday 16 November 2026' });
    expect(
      within(article).getByRole('button', { name: 'Modify booking of Monday 16 November 2026' }),
    ).toBeDisabled();
    expect(article).toHaveTextContent(TEXT.locked);
    // The cancellation follows the rules of MH-08, not this one.
    expect(
      within(article).getByRole('button', { name: 'Cancel booking of Monday 16 November 2026' }),
    ).toBeEnabled();
  });

  it('does not show the 48-hour notice on a booking that can still change', async () => {
    asHiker(() => json([confirmed]));
    renderAt('/bookings');
    const article = await screen.findByRole('article', { name: 'Saturday 21 November 2026' });
    expect(article).not.toHaveTextContent(TEXT.locked);
  });

  it('shows a rejected booking without actions', async () => {
    asHiker(() => json([{ ...confirmed, status: 'REJECTED' }]));
    renderAt('/bookings');
    const article = await screen.findByRole('article', { name: 'Saturday 21 November 2026' });
    expect(article).toHaveTextContent('Rejected');
    expect(within(article).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the cancelled bookings only in their tab', async () => {
    asHiker(() => json([confirmed, cancelled]));
    renderAt('/bookings');

    expect(await screen.findByRole('tab', { name: TEXT.upcoming })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getAllByRole('article')).toHaveLength(1);

    fireEvent.click(screen.getByRole('tab', { name: TEXT.cancelled }));
    expect(screen.getByRole('tab', { name: TEXT.cancelled })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const article = card('Sunday 29 November 2026');
    expect(article).toHaveTextContent('Cancelled');
    expect(within(article).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('suggests booking a table when there are no upcoming bookings', async () => {
    asHiker(() => json([]));
    renderAt('/bookings');
    expect(await screen.findByText(TEXT.noUpcoming)).toBeVisible();
    expect(screen.getByRole('link', { name: TEXT.bookTable })).toHaveAttribute('href', '/book');
  });

  it('says when there are no cancelled bookings', async () => {
    asHiker(() => json([confirmed]));
    renderAt('/bookings');
    fireEvent.click(await screen.findByRole('tab', { name: TEXT.cancelled }));
    expect(screen.getByText(TEXT.noCancelled)).toBeVisible();
  });

  it('asks to log in again when the session has expired', async () => {
    asHiker(() => json({ message: 'Unauthorized' }, 401));
    renderAt('/bookings');
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.sessionExpired);
  });

  it('shows the message of the API for a user without a hiker profile', async () => {
    const message = 'A hiker profile is required to see your bookings';
    asHiker(() => json({ message }, 403));
    renderAt('/bookings');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('shows a generic error when the bookings cannot be loaded', async () => {
    asHiker(() => json({}, 500));
    renderAt('/bookings');
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.loadFailed);
  });

  it('shows a generic error when loading bookings fails with a non-ApiError', async () => {
    stubApi({
      '/api/auth/me': () => json(user),
      '/api/bookings/me': () => {
        throw new Error('Network down');
      },
    });
    renderAt('/bookings');
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXT.loadFailed);
  });

  it('switches back from Cancelled tab to Upcoming tab', async () => {
    asHiker(() => json([confirmed, cancelled]));
    renderAt('/bookings');

    fireEvent.click(await screen.findByRole('tab', { name: TEXT.cancelled }));
    expect(card('Sunday 29 November 2026')).toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: TEXT.upcoming }));
    expect(screen.getByRole('tab', { name: TEXT.upcoming })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(card('Saturday 21 November 2026')).toBeVisible();
    expect(
      screen.queryByRole('article', { name: 'Sunday 29 November 2026' }),
    ).not.toBeInTheDocument();
  });

  describe('cancel a booking (MH-08)', () => {
    const CANCEL = {
      button: 'Cancel booking of Saturday 21 November 2026',
      title: 'Cancel booking',
      question: 'Are you sure you want to cancel the following booking?',
      recap: 'Saturday 21 November 2026 · 12:30–14:00 · 4 people',
      goBack: 'Go back',
      confirm: 'Confirm',
      doneTitle: 'Booking cancelled',
      ok: 'OK',
      failed: 'The booking could not be cancelled. Please try again.',
      alreadyCancelled: 'This booking is already cancelled',
    } as const;

    // The list of bookings changes once the API has cancelled the booking.
    function asHikerWithCancel(answer: () => Response) {
      let cancelledNow = false;
      return stubApi({
        '/api/auth/me': () => json(user),
        '/api/bookings/me': () =>
          json([cancelledNow ? { ...confirmed, status: 'CANCELLED' } : confirmed]),
        '/api/bookings/1/cancel': () => {
          const response = answer();
          cancelledNow = response.ok;
          return response;
        },
      });
    }

    async function openDialog() {
      renderAt('/bookings');
      fireEvent.click(await screen.findByRole('button', { name: CANCEL.button }));
      return screen.getByRole('dialog', { name: CANCEL.title });
    }

    it('asks to confirm and shows a recap of the booking', async () => {
      const fetchMock = asHikerWithCancel(() => json({}));
      const dialog = await openDialog();

      expect(dialog).toHaveTextContent(CANCEL.question);
      expect(dialog).toHaveTextContent(CANCEL.recap);
      expect(within(dialog).getByRole('button', { name: CANCEL.goBack })).toHaveFocus();
      expect(fetchMock).not.toHaveBeenCalledWith('/api/bookings/1/cancel', expect.anything());
    });

    it('closes without cancelling on Go back', async () => {
      const fetchMock = asHikerWithCancel(() => json({}));
      const dialog = await openDialog();

      fireEvent.click(within(dialog).getByRole('button', { name: CANCEL.goBack }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(card('Saturday 21 November 2026')).toBeVisible();
      expect(fetchMock).not.toHaveBeenCalledWith('/api/bookings/1/cancel', expect.anything());
    });

    it('cancels on Confirm and moves the booking among the cancelled ones', async () => {
      const fetchMock = asHikerWithCancel(() =>
        json({ id: 1, slotId: 10, partySize: 4, status: 'CANCELLED' }),
      );
      const dialog = await openDialog();

      fireEvent.click(within(dialog).getByRole('button', { name: CANCEL.confirm }));

      const done = await screen.findByRole('dialog', { name: CANCEL.doneTitle });
      expect(done).toHaveTextContent(CANCEL.recap);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bookings/1/cancel',
        expect.objectContaining({ method: 'POST' }),
      );

      fireEvent.click(within(done).getByRole('button', { name: CANCEL.ok }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(await screen.findByText(TEXT.noUpcoming)).toBeVisible();

      fireEvent.click(screen.getByRole('tab', { name: TEXT.cancelled }));
      expect(card('Saturday 21 November 2026')).toHaveTextContent('Cancelled');
    });

    it('shows the message of the API when the booking cannot be cancelled', async () => {
      asHikerWithCancel(() => json({ message: CANCEL.alreadyCancelled }, 409));
      const dialog = await openDialog();

      fireEvent.click(within(dialog).getByRole('button', { name: CANCEL.confirm }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(CANCEL.alreadyCancelled);
    });

    it('asks to log in again when the session has expired', async () => {
      asHikerWithCancel(() => json({}, 401));
      const dialog = await openDialog();

      fireEvent.click(within(dialog).getByRole('button', { name: CANCEL.confirm }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(TEXT.sessionExpired);
    });

    it('shows a generic error when the cancellation fails', async () => {
      asHikerWithCancel(() => json({}, 500));
      const dialog = await openDialog();

      fireEvent.click(within(dialog).getByRole('button', { name: CANCEL.confirm }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(CANCEL.failed);
    });

    it('closes with the Escape key', async () => {
      asHikerWithCancel(() => json({}));
      await openDialog();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
