import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { Mailer } from './mailer.js';
import { NotificationService } from './notification.service.js';
import type { BookingConfirmationData } from './templates/booking-confirmation.js';

describe('NotificationService', () => {
  let service: NotificationService;
  const mailer = { send: vi.fn() };
  const prisma = { notification: { create: vi.fn() } };

  const booking: BookingConfirmationData = {
    firstName: 'Anna',
    bookingId: 42,
    date: new Date('2026-11-14T00:00:00.000Z'),
    startTime: new Date('1970-01-01T12:30:00.000Z'),
    endTime: new Date('1970-01-01T13:30:00.000Z'),
    partySize: 4,
    requirements: null,
  };
  const recipient = { userId: 7, email: 'anna@example.com' };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: Mailer, useValue: mailer },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(NotificationService);
  });

  describe('sendBookingConfirmation', () => {
    it('sends the confirmation to the hiker', async () => {
      mailer.send.mockResolvedValue(undefined);

      await service.sendBookingConfirmation(recipient, booking);

      expect(mailer.send).toHaveBeenCalledOnce();
      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'anna@example.com',
          subject: expect.stringContaining('Prenotazione n. 42 confermata'),
          text: expect.stringContaining('Ciao Anna'),
          html: expect.stringContaining('Ciao Anna'),
        }),
      );
    });

    it('records the email as sent', async () => {
      mailer.send.mockResolvedValue(undefined);

      const status = await service.sendBookingConfirmation(recipient, booking);

      expect(status).toBe('SENT');
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          type: 'BOOKING_CONFIRMATION',
          recipient: 'anna@example.com',
          subject: expect.stringContaining('Prenotazione n. 42 confermata'),
          status: 'SENT',
          error: null,
          userId: 7,
        },
      });
    });

    it('does not throw when the SMTP server fails, and records the failure', async () => {
      mailer.send.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:1025'));

      const status = await service.sendBookingConfirmation(recipient, booking);

      expect(status).toBe('FAILED');
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'FAILED',
          error: 'connect ECONNREFUSED 127.0.0.1:1025',
        }),
      });
    });

    it('records the reasons of an error without message', async () => {
      // What Nodemailer throws when no address of the SMTP host accepts the connection.
      mailer.send.mockRejectedValue(
        new AggregateError(
          [
            new Error('connect ECONNREFUSED ::1:1025'),
            new Error('connect ECONNREFUSED 127.0.0.1:1025'),
          ],
          '',
        ),
      );

      await service.sendBookingConfirmation(recipient, booking);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          error: 'connect ECONNREFUSED ::1:1025; connect ECONNREFUSED 127.0.0.1:1025',
        }),
      });
    });

    it('does not throw when the notification cannot be recorded', async () => {
      mailer.send.mockResolvedValue(undefined);
      prisma.notification.create.mockRejectedValue(new Error('database down'));

      await expect(service.sendBookingConfirmation(recipient, booking)).resolves.toBe('SENT');
    });

    it('sends nothing to a hiker without email', async () => {
      const status = await service.sendBookingConfirmation({ userId: 7, email: null }, booking);

      expect(status).toBe('SKIPPED');
      expect(mailer.send).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });
});
