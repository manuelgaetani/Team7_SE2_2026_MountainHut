import { describe, expect, it } from 'vitest';
import { DEFAULT_MAIL_FROM, loadAppConfig } from './app-config.js';

const base = { JWT_SECRET: 's3cret', DATABASE_URL: 'postgres://x' };

describe('loadAppConfig', () => {
  it('rejects a missing JWT secret', () => {
    expect(() => loadAppConfig({ DATABASE_URL: 'postgres://x' })).toThrow(
      'JWT_SECRET is not defined',
    );
  });

  it('rejects a missing database url', () => {
    expect(() => loadAppConfig({ JWT_SECRET: 's' })).toThrow('DATABASE_URL is not defined');
  });

  it('rejects a non positive refresh ttl', () => {
    expect(() => loadAppConfig({ ...base, REFRESH_TOKEN_TTL_DAYS: '0' })).toThrow(
      'REFRESH_TOKEN_TTL_DAYS must be a positive number of days',
    );
    expect(() => loadAppConfig({ ...base, REFRESH_TOKEN_TTL_DAYS: 'abc' })).toThrow(
      'REFRESH_TOKEN_TTL_DAYS must be a positive number of days',
    );
  });

  it('applies the defaults', () => {
    expect(loadAppConfig(base)).toMatchObject({
      jwtSecret: 's3cret',
      jwtExpiresIn: '15m',
      refreshTtlMs: 86_400_000,
      bookingTimeZone: 'Europe/Rome',
      secureCookies: false,
      databaseUrl: 'postgres://x',
      mailFrom: DEFAULT_MAIL_FROM,
    });
  });

  it('reads the configured values', () => {
    expect(
      loadAppConfig({
        ...base,
        JWT_EXPIRES_IN: '1h',
        REFRESH_TOKEN_TTL_DAYS: '2',
        BOOKING_TIMEZONE: 'UTC',
        NODE_ENV: 'production',
        MAIL_FROM: 'Rifugio <hut@example.com>',
      }),
    ).toMatchObject({
      jwtExpiresIn: '1h',
      refreshTtlMs: 172_800_000,
      bookingTimeZone: 'UTC',
      secureCookies: true,
      mailFrom: 'Rifugio <hut@example.com>',
    });
  });

  it('falls back to the default sender when MAIL_FROM is empty', () => {
    expect(loadAppConfig({ ...base, MAIL_FROM: '' }).mailFrom).toBe(DEFAULT_MAIL_FROM);
  });

  describe('smtp', () => {
    const smtp = (env: Record<string, string>) => loadAppConfig({ ...base, ...env }).smtp;

    it('targets Mailpit on localhost when nothing is configured', () => {
      expect(smtp({})).toEqual({ host: 'localhost', port: 1025, secure: false });
    });

    it('uses the configured server and credentials', () => {
      expect(
        smtp({
          SMTP_HOST: 'smtp.example.com',
          SMTP_PORT: '587',
          SMTP_USER: 'hut',
          SMTP_PASS: 'secret',
        }),
      ).toEqual({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: 'hut', pass: 'secret' },
      });
    });

    it('uses implicit TLS on port 465', () => {
      expect(smtp({ SMTP_PORT: '465' })).toMatchObject({ secure: true });
    });

    it('requires TLS when credentials are sent, so they never travel in clear text', () => {
      expect(smtp({ SMTP_USER: 'hut', SMTP_PASS: 'secret' })).toMatchObject({ requireTLS: true });
    });

    it('does not require TLS for Mailpit, which has no credentials and no certificate', () => {
      expect(smtp({ SMTP_HOST: 'mailpit' })).not.toHaveProperty('requireTLS');
    });

    it('sends no credentials when the user is empty', () => {
      expect(smtp({ SMTP_USER: '', SMTP_PASS: '' })).not.toHaveProperty('auth');
    });

    it('uses an empty password when only the user is set', () => {
      expect(smtp({ SMTP_USER: 'hut' })).toMatchObject({ auth: { user: 'hut', pass: '' } });
    });

    it('uses the default port when SMTP_PORT is empty', () => {
      expect(smtp({ SMTP_PORT: '' })).toMatchObject({ port: 1025 });
    });

    it('rejects invalid ports', () => {
      for (const port of ['abc', '25.5', '0', '-1', '65536']) {
        expect(() => smtp({ SMTP_PORT: port })).toThrow(`SMTP_PORT is not a valid port: ${port}`);
      }
    });
  });
});
