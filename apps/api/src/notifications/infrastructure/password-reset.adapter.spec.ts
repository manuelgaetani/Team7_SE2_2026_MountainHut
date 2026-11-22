import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { NotificationService } from '../notification.service.js';
import { PasswordResetAdapter } from './password-reset.adapter.js';

// MH-07 (R8): the link of the reset email points to the page of the web app.

const user = { id: 5, email: 'anna@example.it' };
const expiresAt = new Date('2026-11-21T10:00:00.000Z');

describe('PasswordResetAdapter', () => {
  const notifications = { sendPasswordReset: vi.fn() };
  const config = { webUrl: 'http://localhost:3000' };
  let adapter: PasswordResetAdapter;

  beforeEach(() => {
    vi.resetAllMocks();
    config.webUrl = 'http://localhost:3000';
    notifications.sendPasswordReset.mockResolvedValue('SENT');
    adapter = new PasswordResetAdapter(
      config as unknown as AppConfig,
      notifications as unknown as NotificationService,
    );
  });

  it('sends the link WEB_URL/reset-password?token=<code> with its expiry to the user', async () => {
    await adapter.send(user, 'abc123', expiresAt);
    expect(notifications.sendPasswordReset).toHaveBeenCalledWith(
      { userId: 5, email: 'anna@example.it' },
      { link: 'http://localhost:3000/reset-password?token=abc123', expiresAt },
    );
  });

  it('uses the configured address of the web app', async () => {
    config.webUrl = 'https://hut.example.it';
    await adapter.send(user, 'abc123', expiresAt);
    expect(notifications.sendPasswordReset).toHaveBeenCalledWith(expect.anything(), {
      link: 'https://hut.example.it/reset-password?token=abc123',
      expiresAt,
    });
  });

  it('encodes the code, so it cannot break or extend the query string', async () => {
    await adapter.send(user, 'a+b/c=d&role=admin', expiresAt);
    const [, data] = notifications.sendPasswordReset.mock.calls[0] as [unknown, { link: string }];
    expect(data.link).toBe(
      'http://localhost:3000/reset-password?token=a%2Bb%2Fc%3Dd%26role%3Dadmin',
    );
    expect(new URL(data.link).searchParams.get('token')).toBe('a+b/c=d&role=admin');
  });

  it('keeps a base64url code as it is', async () => {
    await adapter.send(user, 'Ab_9-xY', expiresAt);
    expect(notifications.sendPasswordReset).toHaveBeenCalledWith(expect.anything(), {
      link: 'http://localhost:3000/reset-password?token=Ab_9-xY',
      expiresAt,
    });
  });

  it('resolves with nothing once the email is handled, also when it failed', async () => {
    notifications.sendPasswordReset.mockResolvedValue('FAILED');
    await expect(adapter.send(user, 'abc123', expiresAt)).resolves.toBeUndefined();
  });
});
