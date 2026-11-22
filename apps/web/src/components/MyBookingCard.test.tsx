import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyBooking, SlotSummary } from '@mountain-hut/shared';
import { json, stubApi } from '../test/app.tsx';
import { MyBookingCard } from './MyBookingCard.tsx';

const TEXT = {
  modify: 'Modify booking of Saturday 21 November 2026',
  cancel: 'Cancel booking of Saturday 21 November 2026',
  dialogTitle: 'Modify booking',
  dialogCancel: 'Cancel',
  confirmChanges: 'Confirm changes',
  people: 'Number of people',
  dietaryTitle: 'Dietary requirements',
  allergiesBadge: 'Allergies',
  pendingNote: "We'll email you as soon as the request is confirmed.",
  lockedNotice:
    'This booking can no longer be changed: changes are admitted up to 48 hours before the booked date.',
  updatedBanner: "Booking updated. We'll email you the new details.",
} as const;

const baseBooking: MyBooking = {
  id: 1,
  slotId: 10,
  date: '2026-11-21',
  startTime: '12:30',
  endTime: '14:00',
  partySize: 4,
  requirements: [],
  status: 'CONFIRMED',
};

const slots: SlotSummary[] = [
  {
    id: 10,
    date: '2026-11-21',
    startTime: '12:30',
    endTime: '14:00',
    freeSeats: 4,
    availability: 'AVAILABLE',
  },
];

function renderCard(booking: MyBooking) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MyBookingCard booking={booking} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('MyBookingCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 15, 12, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders a confirmed booking without dietary requirements or pending note', () => {
    renderCard(baseBooking);
    const article = screen.getByRole('article', { name: 'Saturday 21 November 2026' });
    expect(article).toHaveTextContent('Nov21');
    expect(article).toHaveTextContent('12:30 · 4 people');
    expect(article).toHaveTextContent('Confirmed');
    expect(article).not.toHaveTextContent(TEXT.dietaryTitle);
    expect(article).not.toHaveTextContent(TEXT.pendingNote);
    expect(article).not.toHaveTextContent(TEXT.lockedNotice);
  });

  it('renders singular person label when partySize is 1', () => {
    renderCard({ ...baseBooking, partySize: 1 });
    expect(screen.getByRole('article')).toHaveTextContent('12:30 · 1 person');
  });

  it('renders dietary requirements with the Allergies badge only on flagged items', () => {
    renderCard({
      ...baseBooking,
      requirements: [
        { allergies: true, description: 'peanut allergy' },
        { allergies: false, description: '2 vegetarians' },
      ],
    });

    expect(screen.getByText(TEXT.dietaryTitle)).toBeVisible();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(TEXT.allergiesBadge)).toBeVisible();
    expect(items[0]).toHaveTextContent('peanut allergy');
    expect(within(items[1]).queryByText(TEXT.allergiesBadge)).not.toBeInTheDocument();
    expect(items[1]).toHaveTextContent('2 vegetarians');
  });

  it('shows pending note when PENDING booking has no requirements, and hides it when requirements exist', () => {
    const { rerender } = renderCard({ ...baseBooking, status: 'PENDING', requirements: [] });
    expect(screen.getByText('Awaiting confirmation')).toBeVisible();
    expect(screen.getByText(TEXT.pendingNote)).toBeVisible();

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <MyBookingCard
          booking={{
            ...baseBooking,
            status: 'PENDING',
            requirements: [{ allergies: false, description: 'vegetarian' }],
          }}
          onCancel={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByText(TEXT.pendingNote)).not.toBeInTheDocument();
    expect(screen.getByText('vegetarian')).toBeVisible();
  });

  it('enables Modify at exactly 48 hours and disables it 1 minute inside the 48-hour window', () => {
    vi.setSystemTime(new Date(2026, 10, 19, 12, 30));
    const { unmount } = renderCard(baseBooking);
    expect(screen.getByRole('button', { name: TEXT.modify })).toBeEnabled();
    expect(screen.queryByText(TEXT.lockedNotice)).not.toBeInTheDocument();
    unmount();

    vi.setSystemTime(new Date(2026, 10, 19, 12, 31));
    renderCard({ ...baseBooking, status: 'PENDING' });
    expect(screen.getByRole('button', { name: TEXT.modify })).toBeDisabled();
    expect(screen.getByRole('button', { name: TEXT.cancel })).toBeEnabled();
    expect(screen.getByText(TEXT.lockedNotice)).toBeVisible();
  });

  it.each([
    ['REJECTED', 'Rejected'],
    ['CANCELLED', 'Cancelled'],
  ] as const)(
    'hides actions and 48h notice for %s bookings even within 48 hours',
    (status, label) => {
      vi.setSystemTime(new Date(2026, 10, 20, 12, 0));
      renderCard({ ...baseBooking, status });
      const article = screen.getByRole('article');
      expect(article).toHaveTextContent(label);
      expect(within(article).queryByRole('button')).not.toBeInTheDocument();
      expect(article).not.toHaveTextContent(TEXT.lockedNotice);
    },
  );

  it('opens ModifyBookingDialog, handles close without banner, shows updated banner on save, and clears banner when reopened', async () => {
    stubApi({
      '/api/slots': () => json(slots),
      '/api/bookings/1': () => json({ ...baseBooking, partySize: 6 }),
    });
    renderCard(baseBooking);

    fireEvent.click(screen.getByRole('button', { name: TEXT.modify }));
    const dialog = screen.getByRole('dialog', { name: TEXT.dialogTitle });
    expect(dialog).toBeVisible();

    fireEvent.click(within(dialog).getByRole('button', { name: TEXT.dialogCancel }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(TEXT.updatedBanner)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: TEXT.modify }));
    fireEvent.change(screen.getByLabelText(TEXT.people), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: TEXT.confirmChanges }));

    const banner = await screen.findByText(TEXT.updatedBanner);
    expect(banner).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: TEXT.modify }));
    expect(screen.queryByText(TEXT.updatedBanner)).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: TEXT.dialogTitle })).toBeVisible();
  });
});
