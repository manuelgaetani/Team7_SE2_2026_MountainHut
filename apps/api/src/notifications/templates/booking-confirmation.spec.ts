import { existsSync } from 'node:fs';
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
  requirements: [],
};

// The HTML version is full of inline styles: the tests look at its content.
const withoutStyles = (html: string): string => html.replace(/ style="[^"]*"/g, '');

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

  it('shows the requirements of the party', () => {
    const { text, html } = bookingConfirmationEmail({
      ...booking,
      requirements: [{ allergies: false, description: '2 vegetarians' }],
    });
    expect(text).toContain('Requirements: 2 vegetarians');
    expect(withoutStyles(html)).toContain('<td>2 vegetarians</td>');
  });

  it('shows one line per requirement and marks the ones with allergies', () => {
    const { text, html } = bookingConfirmationEmail({
      ...booking,
      requirements: [
        { allergies: true, description: '1 peanut allergy' },
        { allergies: false, description: '2 vegetarians' },
      ],
    });
    expect(text).toContain(
      'Requirements: Allergies (special care needed): 1 peanut allergy\n2 vegetarians',
    );
    expect(withoutStyles(html)).toContain(
      '<td>Allergies (special care needed): 1 peanut allergy<br>2 vegetarians</td>',
    );
  });

  it('escapes the requirements and keeps their line breaks in the HTML version', () => {
    const { html } = bookingConfirmationEmail({
      ...booking,
      requirements: [{ allergies: false, description: 'Celiac\n<b>Nuts</b> & "lactose"' }],
    });
    expect(withoutStyles(html)).toContain(
      '<td>Celiac<br>&lt;b&gt;Nuts&lt;/b&gt; &amp; &quot;lactose&quot;</td>',
    );
  });

  it('escapes the name of the hiker in the HTML version', () => {
    const { html } = bookingConfirmationEmail({
      ...booking,
      fullName: '<script>alert("x")</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('shows every detail of the booking in the HTML version', () => {
    const html = withoutStyles(bookingConfirmationEmail(booking).html);
    expect(html).toContain('>Booking n.</th><td>42</td>');
    expect(html).toContain('>Name</th><td>Anna Rossi</td>');
    expect(html).toContain('>People</th><td>4 people</td>');
    expect(html).toContain('<td>Saturday, 14 November 2026</td>');
    expect(html).toContain('<td>12:30 - 13:30</td>');
  });

  it('shows a summary of the booking in the inbox preview', () => {
    expect(bookingConfirmationEmail(booking).html).toContain(
      '>Saturday, 14 November 2026, 12:30 - 13:30, 4 people</div>',
    );
  });

  it('sends the header photo with the email and shows it in the HTML version', () => {
    const { html, attachments } = bookingConfirmationEmail(booking);
    expect(attachments).toHaveLength(1);
    expect(existsSync(attachments[0].path)).toBe(true);
    expect(html).toContain(`src="cid:${attachments[0].cid}"`);
    expect(html).toContain('alt="Trail leading to Monte Vettore"');
  });

  it('is a complete HTML document with the subject as its title', () => {
    const { html } = bookingConfirmationEmail(booking);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Booking n. 42 confirmed - Saturday, 14 November 2026</title>');
  });

  it('uses the singular for a party of one in the HTML version', () => {
    expect(withoutStyles(bookingConfirmationEmail({ ...booking, partySize: 1 }).html)).toContain(
      '<td>1 person</td>',
    );
  });

  it('keeps the line breaks of Windows-style requirements in the HTML version', () => {
    const { html } = bookingConfirmationEmail({
      ...booking,
      requirements: [{ allergies: false, description: 'Celiac\r\nNuts' }],
    });
    expect(withoutStyles(html)).toContain('<td>Celiac<br>Nuts</td>');
  });

  it('does not escape twice the requirements', () => {
    const { html } = bookingConfirmationEmail({
      ...booking,
      requirements: [{ allergies: false, description: '&lt;' }],
    });
    expect(withoutStyles(html)).toContain('<td>&amp;lt;</td>');
  });

  it('shows the name of the hiker in the greeting of the subject-less text', () => {
    expect(bookingConfirmationEmail(booking).text.startsWith('Hi Anna Rossi,')).toBe(true);
  });
});
