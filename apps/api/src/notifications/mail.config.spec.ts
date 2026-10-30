import { describe, expect, it } from 'vitest';
import { DEFAULT_MAIL_FROM, mailFromEnv, smtpOptionsFromEnv } from './mail.config.js';

describe('smtpOptionsFromEnv', () => {
  it('targets Mailpit on localhost when nothing is configured', () => {
    expect(smtpOptionsFromEnv({})).toEqual({ host: 'localhost', port: 1025, secure: false });
  });

  it('uses the configured server and credentials', () => {
    expect(
      smtpOptionsFromEnv({
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_USER: 'hut',
        SMTP_PASS: 'secret',
      }),
    ).toEqual({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'hut', pass: 'secret' },
    });
  });

  it('uses implicit TLS on port 465', () => {
    expect(smtpOptionsFromEnv({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465' })).toMatchObject({
      secure: true,
    });
  });

  it('sends no credentials when the user is empty', () => {
    expect(smtpOptionsFromEnv({ SMTP_USER: '', SMTP_PASS: '' })).not.toHaveProperty('auth');
  });

  it('rejects a port that is not a number', () => {
    expect(() => smtpOptionsFromEnv({ SMTP_PORT: 'abc' })).toThrow('SMTP_PORT');
  });
});

describe('mailFromEnv', () => {
  it('falls back to the default sender', () => {
    expect(mailFromEnv({})).toBe(DEFAULT_MAIL_FROM);
    expect(mailFromEnv({ MAIL_FROM: '' })).toBe(DEFAULT_MAIL_FROM);
  });

  it('uses the configured sender', () => {
    expect(mailFromEnv({ MAIL_FROM: 'Rifugio <hut@example.com>' })).toBe(
      'Rifugio <hut@example.com>',
    );
  });
});
