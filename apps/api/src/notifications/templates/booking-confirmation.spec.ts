import { describe, expect, it } from 'vitest';
import { bookingConfirmationEmail } from './booking-confirmation.js';
import type { BookingConfirmationData } from './booking-confirmation.js';

// Same shape Prisma returns for `@db.Date` and `@db.Time` columns: UTC-based dates.
const booking: BookingConfirmationData = {
  firstName: 'Anna',
  bookingId: 42,
  date: new Date('2026-11-14T00:00:00.000Z'),
  startTime: new Date('1970-01-01T12:30:00.000Z'),
  endTime: new Date('1970-01-01T13:30:00.000Z'),
  partySize: 4,
};

describe('bookingConfirmationEmail', () => {
  it('puts the booking number and the date in the subject', () => {
    expect(bookingConfirmationEmail(booking).subject).toBe(
      'Prenotazione n. 42 confermata - sabato 14 novembre 2026',
    );
  });

  it('describes the booking in the text version', () => {
    const { text } = bookingConfirmationEmail(booking);
    expect(text).toContain('Ciao Anna');
    expect(text).toContain('sabato 14 novembre 2026');
    expect(text).toContain('12:30 - 13:30');
    expect(text).toContain('4 persone');
  });

  it('shows the times of the slot without shifting them to another time zone', () => {
    const { text } = bookingConfirmationEmail({
      ...booking,
      date: new Date('2026-12-31T00:00:00.000Z'),
      startTime: new Date('1970-01-01T23:00:00.000Z'),
      endTime: new Date('1970-01-01T23:59:00.000Z'),
    });
    expect(text).toContain('giovedì 31 dicembre 2026');
    expect(text).toContain('23:00 - 23:59');
  });

  it('uses the singular for a party of one', () => {
    expect(bookingConfirmationEmail({ ...booking, partySize: 1 }).text).toContain('1 persona');
  });

  it('describes the booking in the HTML version', () => {
    const { html } = bookingConfirmationEmail(booking);
    expect(html).toContain('Ciao Anna');
    expect(html).toContain('12:30 - 13:30');
  });

  it('escapes the name of the hiker in the HTML version', () => {
    const { html } = bookingConfirmationEmail({
      ...booking,
      firstName: '<script>alert("x")</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });
});
