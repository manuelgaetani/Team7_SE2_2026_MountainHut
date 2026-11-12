import { fileURLToPath } from 'node:url';
import type { MailAttachment } from '../mailer.js';
import { escapeHtml } from './escape-html.js';

export interface BookingConfirmationData {
  fullName: string;
  bookingId: number;
  // Day of the slot, as Prisma returns a `@db.Date` column (midnight UTC).
  date: Date;
  // Start and end of the slot, as Prisma returns `@db.Time` columns (1970-01-01, UTC).
  startTime: Date;
  endTime: Date;
  partySize: number;
  // Party needs typed by the hiker (e.g. allergies); null when there are none.
  requirements: string | null;
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
  attachments: MailAttachment[];
}

// Date and time columns carry no time zone: format them in UTC so they are shown unchanged.
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

// nest-cli.json copies the assets folder next to the compiled template.
const HEADER_IMAGE: MailAttachment = {
  filename: 'monte-vettore.jpg',
  path: fileURLToPath(new URL('./assets/monte-vettore-header.jpg', import.meta.url)),
  cid: 'hut-header-image',
};

// Text colors of the web app on a white background. Email clients ignore most stylesheets and
// web fonts, and Gmail drops SVG: the layout uses tables with inline styles, and the fonts below
// exist on every device.
const COLOR = {
  background: '#ffffff',
  ink: '#173d33',
  muted: '#55675f',
  line: '#e0dccf',
};
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const toHtml = (value: string): string => escapeHtml(value).replace(/\r?\n/g, '<br>');

interface ConfirmationHtml {
  subject: string;
  preview: string;
  greeting: string;
  intro: string;
  day: string;
  time: string;
  rows: [label: string, value: string][];
  closing: string;
}

function confirmationHtml(content: ConfirmationHtml): string {
  const rows = content.rows
    .map(
      ([label, value]) =>
        `<tr><th align="left" valign="top" width="120" style="padding:12px 12px 12px 0;border-top:1px solid ${COLOR.line};font-family:${SANS};font-size:14px;line-height:22px;font-weight:400;color:${COLOR.muted};">${label}</th><td style="padding:12px 0;border-top:1px solid ${COLOR.line};font-family:${SANS};font-size:15px;line-height:22px;color:${COLOR.ink};word-break:break-word;">${toHtml(value)}</td></tr>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.background};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLOR.background};">${escapeHtml(content.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.background}">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.background}" style="max-width:560px;border:1px solid ${COLOR.line};">
<tr><td style="padding:0;font-family:${SANS};font-size:15px;line-height:22px;color:${COLOR.ink};"><img src="cid:${HEADER_IMAGE.cid}" width="560" alt="Trail leading to Monte Vettore" style="display:block;width:100%;max-width:560px;height:auto;border:0;"></td></tr>
<tr><td style="padding:32px 32px 0;font-family:${SERIF};font-size:22px;line-height:28px;color:${COLOR.ink};">Mountain hut &middot; Monte Vettore</td></tr>
<tr><td style="padding:12px 32px 8px;font-family:${SANS};font-size:15px;line-height:24px;color:${COLOR.ink};word-break:break-word;">${escapeHtml(content.greeting)}<br>${content.intro}</td></tr>
<tr><td style="padding:16px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:0 0 4px;font-family:${SERIF};font-size:28px;line-height:34px;color:${COLOR.ink};">${content.day}</td></tr>
<tr><td style="padding:0;font-family:${SERIF};font-size:20px;line-height:28px;color:${COLOR.ink};">${content.time}</td></tr>
</table>
</td></tr>
<tr><td style="padding:24px 32px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows}
</table>
</td></tr>
<tr><td style="padding:16px 32px 32px;font-family:${SERIF};font-size:18px;line-height:26px;color:${COLOR.ink};">${content.closing}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

interface Wording {
  // What happened to the booking, in the subject: "confirmed", "changed".
  event: string;
  intro: string;
}

export function bookingConfirmationEmail(booking: BookingConfirmationData): EmailContent {
  return bookingEmail(booking, {
    event: 'confirmed',
    intro: 'your table at the hut is booked and confirmed.',
  });
}

// Sent after a change of the booking (MH-06), with its new details.
export function bookingChangeEmail(booking: BookingConfirmationData): EmailContent {
  return bookingEmail(booking, {
    event: 'changed',
    intro: 'your booking at the hut has been changed. These are its new details.',
  });
}

function bookingEmail(booking: BookingConfirmationData, wording: Wording): EmailContent {
  const day = dateFormat.format(booking.date);
  const time = `${timeFormat.format(booking.startTime)} - ${timeFormat.format(booking.endTime)}`;
  const people = booking.partySize === 1 ? '1 person' : `${booking.partySize} people`;
  const subject = `Booking n. ${booking.bookingId} ${wording.event} - ${day}`;
  const requirements = booking.requirements?.trim() || null;

  const greeting = `Hi ${booking.fullName},`;
  const intro = wording.intro;
  const closing = 'See you at the hut!';
  const signature = 'Mountain Hut';
  const rows: [label: string, value: string][] = [
    ['Booking n.', String(booking.bookingId)],
    ['Name', booking.fullName],
    ['Date', day],
    ['Time', time],
    ['People', people],
    ...(requirements ? ([['Requirements', requirements]] as [string, string][]) : []),
  ];

  const text = [
    greeting,
    '',
    intro,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    closing,
    signature,
  ].join('\n');

  // Date and time lead the HTML version, so they are not repeated in its table.
  const html = confirmationHtml({
    subject,
    preview: `${day}, ${time}, ${people}`,
    greeting,
    intro,
    day,
    time,
    rows: rows.filter(([label]) => label !== 'Date' && label !== 'Time'),
    closing,
  });

  return { subject, text, html, attachments: [HEADER_IMAGE] };
}
