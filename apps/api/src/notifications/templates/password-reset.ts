import type { EmailContent } from './booking-confirmation.js';
import { escapeHtml } from './escape-html.js';

export interface PasswordResetData {
  // Link of the web app page that sets the new password, with the code.
  link: string;
  expiresAt: Date;
}

// The hut is in Europe/Rome: the expiry is shown in its time.
const expiryFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Rome',
  timeZoneName: 'short',
});

// MH-07: the email with the link to set a new password.
export function passwordResetEmail(data: PasswordResetData): EmailContent {
  const expiry = expiryFormat.format(data.expiresAt);
  const subject = 'Reset your Mountain Hut password';
  const text = [
    'We received a request to reset the password of your Mountain Hut account.',
    '',
    `Open this link to choose a new password: ${data.link}`,
    '',
    `The link works once and expires on ${expiry}.`,
    'If you did not ask for it, ignore this email: your password does not change.',
  ].join('\n');
  const link = escapeHtml(data.link);
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#ffffff;color:#173d33;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5">
<p>We received a request to reset the password of your Mountain Hut account.</p>
<p><a href="${link}" style="color:#173d33;font-weight:bold">Choose a new password</a></p>
<p style="color:#55675f">The link works once and expires on ${escapeHtml(expiry)}.<br>If you did not ask for it, ignore this email: your password does not change.</p>
<p style="color:#55675f;font-size:13px">If the button does not work, copy this address into your browser:<br>${link}</p>
</body></html>`;
  return { subject, text, html, attachments: [] };
}
