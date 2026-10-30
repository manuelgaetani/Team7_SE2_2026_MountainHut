import { escapeHtml } from './escape-html.js';

export interface BookingConfirmationData {
  firstName: string;
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
const dateFormat = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const timeFormat = new Intl.DateTimeFormat('it-IT', {
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

  const text = [
    `Hi ${booking.firstName},`,
    '',
    'your booking at the shelter is confirmed.',
    '',
    `Booking n. ${booking.bookingId}`,
    `Data: ${day}`,
    `Time: ${time}`,
    `People: ${people}`,
    ...(requirements ? [`Requirements: ${requirements}`] : []),
    '',
    'We await you!',
    'Mountain Hut',
  ].join('\n');

  const requirementsRow = requirements
    ? `  <tr><th align="left">Requirements</th><td>${escapeHtml(requirements).replace(/\r?\n/g, '<br>')}</td></tr>\n`
    : '';
  const html = `<p>Hi ${escapeHtml(booking.firstName)},</p>
<p>your booking at the shelter is confirmed.</p>
<table>
  <tr><th align="left">Booking n.</th><td>${booking.bookingId}</td></tr>
  <tr><th align="left">Data</th><td>${day}</td></tr>
  <tr><th align="left">Time</th><td>${time}</td></tr>
  <tr><th align="left">People</th><td>${people}</td></tr>
${requirementsRow}</table>
<p>We await you!<br>Mountain Hut</p>`;

  return { subject, text, html };
}
