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
  const people = booking.partySize === 1 ? '1 persona' : `${booking.partySize} persone`;
  const subject = `Prenotazione n. ${booking.bookingId} confermata - ${day}`;

  const text = [
    `Ciao ${booking.firstName},`,
    '',
    'la tua prenotazione al rifugio è confermata.',
    '',
    `Prenotazione n. ${booking.bookingId}`,
    `Data: ${day}`,
    `Orario: ${time}`,
    `Persone: ${people}`,
    '',
    'Ti aspettiamo!',
    'Mountain Hut',
  ].join('\n');

  const html = `<p>Ciao ${escapeHtml(booking.firstName)},</p>
<p>la tua prenotazione al rifugio è confermata.</p>
<table>
  <tr><th align="left">Prenotazione n.</th><td>${booking.bookingId}</td></tr>
  <tr><th align="left">Data</th><td>${day}</td></tr>
  <tr><th align="left">Orario</th><td>${time}</td></tr>
  <tr><th align="left">Persone</th><td>${people}</td></tr>
</table>
<p>Ti aspettiamo!<br>Mountain Hut</p>`;

  return { subject, text, html };
}
