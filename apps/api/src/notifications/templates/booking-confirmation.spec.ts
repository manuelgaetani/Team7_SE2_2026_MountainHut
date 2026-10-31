import { describe, expect, it } from 'vitest';
import { bookingConfirmationEmail } from './booking-confirmation.js';
import type { BookingConfirmationData } from './booking-confirmation.js';

// Same shape Prisma returns for `@db.Date` and `@db.Time` columns: UTC-based dates.
const booking: BookingConfirmationData = {
  fullName: 'Anna Rossi',
  bookingId: 42,
  date: new Date('2026-11-14T00:00:00.000Z'),
  startTime: new Date('1970-01-01T12:30:00.000Z'),
  endTime: new Date('1970-01-01T13:30:00.000Z'),
  partySize: 4,
  requirements: null,
};

describe('bookingConfirmationEmail', () => {
  it('puts the booking number and the date in the subject', () => {
    expect(bookingConfirmationEmail(booking).subject).toBe(
      'Booking n. 42 confirmed - Saturday, 14 November 2026',
    );
  });

  it('describes the booking in the text version', () => {
    const { text } = bookingConfirmationEmail(booking);
    expect(text).toContain('Hi Anna Rossi');
    expect(text).toContain('Name: Anna Rossi');
    expect(text).toContain('Booking n.: 42');
    expect(text).toContain('Saturday, 14 November 2026');
    expect(text).toContain('12:30 - 13:30');
    expect(text).toContain('4 people');
  });

  it('shows the times of the slot without shifting them to another time zone', () => {
    const { text } = bookingConfirmationEmail({
      ...booking,
      date: new Date('2026-12-31T00:00:00.000Z'),
      startTime: new Date('1970-01-01T23:00:00.000Z'),
      endTime: new Date('1970-01-01T23:59:00.000Z'),
    });
    expect(text).toContain('Thursday, 31 December 2026');
    expect(text).toContain('23:00 - 23:59');
  });

  it('uses the singular for a party of one', () => {
    expect(bookingConfirmationEmail({ ...booking, partySize: 1 }).text).toContain('1 person');
  });

  it('describes the booking in the HTML version', () => {
    const { html } = bookingConfirmationEmail(booking);
    expect(html).toContain('Hi Anna');
    expect(html).toContain('12:30 - 13:30');
  });

  it('omits the requirements when there are none', () => {
    const { text, html } = bookingConfirmationEmail(booking);
    expect(text).not.toContain('Requirements');
    expect(html).not.toContain('Requirements');
  });

  it('omits requirements made only of spaces', () => {
    expect(bookingConfirmationEmail({ ...booking, requirements: '   ' }).text).not.toContain(
      'Requirements',
    );
  });

  it('shows the requirements of the party', () => {
    const { text, html } = bookingConfirmationEmail({
      ...booking,
      requirements: 'One celiac, one allergy to nuts',
    });
    expect(text).toContain('Requirements: One celiac, one allergy to nuts');
    expect(html).toContain('<td>One celiac, one allergy to nuts</td>');
  });

  it('escapes the requirements and keeps their line breaks in the HTML version', () => {
    const { html } = bookingConfirmationEmail({
      ...booking,
      requirements: 'Celiac\n<b>Nuts</b> & "lactose"',
    });
    expect(html).toContain('<td>Celiac<br>&lt;b&gt;Nuts&lt;/b&gt; &amp; &quot;lactose&quot;</td>');
  });

  it('escapes the name of the hiker in the HTML version', () => {
    const { html } = bookingConfirmationEmail({
      ...booking,
      fullName: '<script>alert("x")</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });
});
