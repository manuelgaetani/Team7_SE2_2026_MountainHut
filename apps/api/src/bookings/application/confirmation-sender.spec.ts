import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingConfirmationNotifier } from './booking-confirmation.port.js';
import { BookingsRepository } from './bookings.repository.port.js';
import { ConfirmationSender, Sleeper } from './confirmation-sender.js';

describe('ConfirmationSender', () => {
  let sender: ConfirmationSender;
  const notifier = { notify: vi.fn() };
  const repo = { confirmBooking: vi.fn() };
  const sleeper = { sleep: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    sleeper.sleep.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        ConfirmationSender,
        { provide: BookingConfirmationNotifier, useValue: notifier },
        { provide: BookingsRepository, useValue: repo },
        { provide: Sleeper, useValue: sleeper },
      ],
    }).compile();
    sender = module.get(ConfirmationSender);
  });

  it('confirms the booking once its email is sent', async () => {
    notifier.notify.mockResolvedValue('SENT');
    await sender.send(9);
    expect(notifier.notify).toHaveBeenCalledOnce();
    expect(notifier.notify).toHaveBeenCalledWith(9);
    expect(repo.confirmBooking).toHaveBeenCalledWith(9);
    expect(sleeper.sleep).not.toHaveBeenCalled();
  });

  it('retries failed emails, waiting longer each time, and confirms once', async () => {
    notifier.notify
      .mockResolvedValueOnce('FAILED')
      .mockResolvedValueOnce('FAILED')
      .mockResolvedValueOnce('SENT');
    await sender.send(9);
    expect(notifier.notify).toHaveBeenCalledTimes(3);
    expect(sleeper.sleep.mock.calls).toEqual([[1_000], [5_000]]);
    expect(repo.confirmBooking).toHaveBeenCalledOnce();
  });

  it('retries up to three times, the last after 25 seconds', async () => {
    notifier.notify
      .mockResolvedValueOnce('FAILED')
      .mockResolvedValueOnce('FAILED')
      .mockResolvedValueOnce('FAILED')
      .mockResolvedValueOnce('SENT');
    await sender.send(9);
    expect(sleeper.sleep.mock.calls).toEqual([[1_000], [5_000], [25_000]]);
    expect(repo.confirmBooking).toHaveBeenCalledOnce();
  });

  it('leaves the booking pending after four failed attempts', async () => {
    notifier.notify.mockResolvedValue('FAILED');
    await sender.send(9);
    expect(notifier.notify).toHaveBeenCalledTimes(4);
    expect(repo.confirmBooking).not.toHaveBeenCalled();
  });

  it('neither retries nor confirms when there is nothing to send', async () => {
    notifier.notify.mockResolvedValue('SKIPPED');
    await sender.send(9);
    expect(notifier.notify).toHaveBeenCalledOnce();
    expect(sleeper.sleep).not.toHaveBeenCalled();
    expect(repo.confirmBooking).not.toHaveBeenCalled();
  });

  it('does not resend the email when the booking cannot be confirmed', async () => {
    notifier.notify.mockResolvedValue('SENT');
    repo.confirmBooking.mockRejectedValue(new Error('database down'));
    await expect(sender.send(9)).resolves.toBeUndefined();
    expect(notifier.notify).toHaveBeenCalledOnce();
    expect(repo.confirmBooking).toHaveBeenCalledOnce();
  });

  it('never rejects when the notifier throws', async () => {
    notifier.notify.mockRejectedValue(new Error('database down'));
    await expect(sender.send(9)).resolves.toBeUndefined();
    expect(repo.confirmBooking).not.toHaveBeenCalled();
  });
});
