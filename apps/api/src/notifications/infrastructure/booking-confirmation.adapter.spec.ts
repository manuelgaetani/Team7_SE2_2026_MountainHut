import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionContext } from '../../infrastructure/prisma/transaction-context.js';
import { NotificationService } from '../notification.service.js';
import { BookingConfirmationAdapter } from './booking-confirmation.adapter.js';

describe('BookingConfirmationAdapter', () => {
  const findUnique = vi.fn();
  const context = { client: () => ({ booking: { findUnique } }) };
  const notifications = { sendBookingConfirmation: vi.fn() };
  let adapter: BookingConfirmationAdapter;

  const row = {
    partySize: 2,
    requirements: [{ allergies: true, description: 'no nuts' }],
    hiker: { fullName: 'Anna Rossi', userId: 1, user: { email: 'anna@example.com' } },
    slot: {
      date: new Date('2026-11-14T00:00:00.000Z'),
      startTime: new Date('1970-01-01T12:30:00.000Z'),
      endTime: new Date('1970-01-01T13:30:00.000Z'),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    adapter = new BookingConfirmationAdapter(
      context as unknown as TransactionContext,
      notifications as unknown as NotificationService,
    );
  });

  it('sends the booking, its hiker and its slot as plain strings', async () => {
    findUnique.mockResolvedValue(row);
    notifications.sendBookingConfirmation.mockResolvedValue('SENT');
    await expect(adapter.notify(9)).resolves.toBe('SENT');
    expect(notifications.sendBookingConfirmation).toHaveBeenCalledWith(
      { userId: 1, email: 'anna@example.com' },
      {
        bookingId: 9,
        fullName: 'Anna Rossi',
        date: '2026-11-14',
        startTime: '12:30',
        endTime: '13:30',
        partySize: 2,
        requirements: [{ allergies: true, description: 'no nuts' }],
      },
    );
  });

  it('reads the requirements in insert order, with their flag and description only', async () => {
    findUnique.mockResolvedValue(row);
    notifications.sendBookingConfirmation.mockResolvedValue('SENT');
    await adapter.notify(9);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 9 },
        select: expect.objectContaining({
          requirements: {
            select: { allergies: true, description: true },
            orderBy: { id: 'asc' },
          },
        }) as unknown,
      }),
    );
  });

  it('sends a booking without requirements with an empty list', async () => {
    findUnique.mockResolvedValue({ ...row, requirements: [] });
    notifications.sendBookingConfirmation.mockResolvedValue('SENT');
    await adapter.notify(9);
    expect(notifications.sendBookingConfirmation.mock.calls[0][1]).toMatchObject({
      requirements: [],
    });
  });

  it('has no email for a hiker without an account', async () => {
    findUnique.mockResolvedValue({
      ...row,
      hiker: { fullName: 'Anna Rossi', userId: null, user: null },
    });
    notifications.sendBookingConfirmation.mockResolvedValue('SKIPPED');
    await adapter.notify(9);
    expect(notifications.sendBookingConfirmation.mock.calls[0][0]).toEqual({
      userId: null,
      email: null,
    });
  });

  it('skips a booking that does not exist', async () => {
    findUnique.mockResolvedValue(null);
    await expect(adapter.notify(9)).resolves.toBe('SKIPPED');
    expect(notifications.sendBookingConfirmation).not.toHaveBeenCalled();
  });
});
