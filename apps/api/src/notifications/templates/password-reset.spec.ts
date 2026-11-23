import { describe, expect, it } from 'vitest';
import { passwordResetEmail } from './password-reset.js';

// MH-07 black box: the email with the link to set a new password.

const link = 'http://localhost:3000/reset-password?token=abc123';
// 10:00 UTC is 11:00 in Rome in November (CET).
const expiresAt = new Date('2026-11-19T10:00:00.000Z');

describe('passwordResetEmail', () => {
  const email = passwordResetEmail({ link, expiresAt });

  it('has a clear subject and no attachments', () => {
    expect(email.subject).toBe('Reset your Mountain Hut password');
    expect(email.attachments).toEqual([]);
  });

  it('contains the link in the text and in the HTML', () => {
    expect(email.text).toContain(link);
    expect(email.html).toContain('href="http://localhost:3000/reset-password?token=abc123"');
  });

  it('shows the expiry in the time of the hut (Europe/Rome)', () => {
    expect(email.text).toContain('19 November 2026');
    expect(email.text).toContain('11:00');
    expect(email.html).toContain('11:00');
  });

  it('shows the summer time of the hut too', () => {
    // 10:00 UTC is 12:00 in Rome in July (CEST).
    const summer = passwordResetEmail({ link, expiresAt: new Date('2026-07-01T10:00:00.000Z') });
    expect(summer.text).toContain('12:00');
  });

  it('says that the link works once and can be ignored', () => {
    for (const body of [email.text, email.html]) {
      expect(body).toContain('works once');
      expect(body).toContain('ignore this email');
    }
  });

  it('escapes the link in the HTML so it cannot inject markup', () => {
    const evil = passwordResetEmail({ link: 'http://x/"><script>alert(1)</script>', expiresAt });
    expect(evil.html).not.toContain('<script>');
    expect(evil.html).toContain('&lt;script&gt;');
  });
});
