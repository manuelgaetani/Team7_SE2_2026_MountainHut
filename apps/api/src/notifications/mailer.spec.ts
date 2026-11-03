import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmtpMailer } from './mailer.js';

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
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_PORT', '');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('MAIL_FROM', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates the transport from the environment', () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_PORT', '587');

    new SmtpMailer();

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
    });
  });

  it('sends the message with the default sender', async () => {
    sendMail.mockResolvedValue(undefined);

    await new SmtpMailer().send(message);

    expect(sendMail).toHaveBeenCalledWith({
      from: 'Mountain Hut <no-reply@mountain-hut.test>',
      ...message,
    });
  });

  it('sends the message with the configured sender', async () => {
    vi.stubEnv('MAIL_FROM', 'Rifugio <hut@example.com>');
    sendMail.mockResolvedValue(undefined);

    await new SmtpMailer().send(message);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Rifugio <hut@example.com>' }),
    );
  });

  it('lets the error of the SMTP server reach the caller', async () => {
    sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(new SmtpMailer().send(message)).rejects.toThrow('connect ECONNREFUSED');
  });
});
