import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAppConfig } from '../config/app-config.js';
import { SmtpMailer } from './mailer.js';

const mailer = (env: Record<string, string> = {}) =>
  new SmtpMailer(loadAppConfig({ JWT_SECRET: 's', DATABASE_URL: 'postgresql://x', ...env }));

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});

vi.mock('nodemailer', () => ({ default: { createTransport } }));

const message = {
  to: 'anna@example.com',
  subject: 'Booking n. 42 confirmed',
  text: 'Hi Anna',
  html: '<p>Hi Anna</p>',
};

describe('SmtpMailer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the transport from the configuration', () => {
    mailer({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587' });

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
    });
  });

  it('sends the message with the default sender', async () => {
    sendMail.mockResolvedValue(undefined);

    await mailer().send(message);

    expect(sendMail).toHaveBeenCalledWith({
      from: 'Mountain Hut <no-reply@mountain-hut.test>',
      ...message,
    });
  });

  it('sends the message with the configured sender', async () => {
    sendMail.mockResolvedValue(undefined);

    await mailer({ MAIL_FROM: 'Rifugio <hut@example.com>' }).send(message);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Rifugio <hut@example.com>' }),
    );
  });

  it('lets the error of the SMTP server reach the caller', async () => {
    sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(mailer().send(message)).rejects.toThrow('connect ECONNREFUSED');
  });
});
