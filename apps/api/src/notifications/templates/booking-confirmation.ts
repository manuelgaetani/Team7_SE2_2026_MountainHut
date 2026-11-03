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

export function bookingConfirmationEmail(booking: BookingConfirmationData): EmailContent {
  const day = dateFormat.format(booking.date);
  const time = `${timeFormat.format(booking.startTime)} - ${timeFormat.format(booking.endTime)}`;
  const people = booking.partySize === 1 ? '1 person' : `${booking.partySize} people`;
  const subject = `Booking n. ${booking.bookingId} confirmed - ${day}`;
  const requirements = booking.requirements?.trim() || null;

  const greeting = `Hi ${booking.fullName},`;
  const intro = 'your booking at the shelter is confirmed.';
  const closing = 'We await you!';
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

  const htmlRows = rows
    .map(
      ([label, value]) =>
        `  <tr><th align="left">${label}</th><td>${escapeHtml(value).replace(/\r?\n/g, '<br>')}</td></tr>`,
    )
    .join('\n');
  const html = `<p>${escapeHtml(greeting)}</p>
<p>${intro}</p>
<table>
${htmlRows}
</table>
<p>${closing}<br>${signature}</p>`;

  return { subject, text, html };
}
