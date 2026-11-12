import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';

// There is no API to create slots yet (MH-02), so the tests write them in the database
// of the running `docker compose` stack.
function sql(statement: string): string {
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      'psql -v ON_ERROR_STOP=1 -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ],
    { input: statement, encoding: 'utf8' },
  ).trim();
}

const toValues = (slotId: string, seats: number[]) =>
  seats.map((s, i) => `(${slotId}, ${i + 1}, ${s})`).join(', ');

function insertSlot(date: string, startTime: string, endTime: string, seats: number[]): number {
  const slotId = sql(
    `INSERT INTO slots (date, start_time, end_time)
     VALUES (${date}, ${startTime}, ${endTime}) RETURNING id;`,
  );
  // No seats: a slot without tables, which has 0 seats (MH-02, issue #17).
  if (seats.length > 0) {
    sql(
      `INSERT INTO slot_tables (slot_id, table_number, seats) VALUES ${toValues(slotId, seats)};`,
    );
  }
  return Number(slotId);
}

// A slot far in the future. The date is random because tests share the database.
export function createSlot(seats: number[]): number {
  const date = `DATE '2031-01-01' + ${randomInt(36_500)}`;
  return insertSlot(date, `TIME '19:00'`, `TIME '21:00'`, seats);
}

// A slot that starts in about one hour, too soon to book.
// The start is a whole minute, like the slots created through the API (HH:MM): the API looks a
// slot up by its start time (MH-04), which would never match a start with seconds. Tests run in
// parallel and slots are unique by date, start and end, so the end is random to the second.
export function createImminentSlot(seats: number[]): number {
  const start = `date_trunc('minute', now() AT TIME ZONE 'Europe/Rome' + interval '1 hour' + ${randomInt(30)} * interval '1 minute')`;
  const end = `TIME '23:59' + ${randomInt(60)} * interval '1 second'`;
  return insertSlot(`${start}::date`, `${start}::time(0)`, end, seats);
}

// A slot that is already over.
export function createPastSlot(seats: number[]): number {
  const date = `DATE '2001-01-01' + ${randomInt(3_650)}`;
  return insertSlot(date, `TIME '19:00'`, `TIME '21:00'`, seats);
}

export function bookingStatus(bookingId: number): string {
  return sql(`SELECT status FROM bookings WHERE id = ${Number(bookingId)};`);
}

// Turns a registered user into an account without a hiker profile, like a staff account.
export function removeHikerProfile(email: string): void {
  const quoted = email.replaceAll("'", "''");
  sql(`DELETE FROM hikers WHERE user_id = (SELECT id FROM users WHERE email = '${quoted}');`);
}

export function deleteSlot(slotId: number): void {
  sql(`DELETE FROM booking_tables WHERE slot_id = ${slotId};
       DELETE FROM bookings WHERE slot_id = ${slotId};
       DELETE FROM slot_tables WHERE slot_id = ${slotId};
       DELETE FROM slots WHERE id = ${slotId};`);
}
// Changes the role of a user in the database so they can act as staff.
export function setUserRole(email: string, role: 'EMPLOYEE' | 'WARDEN' | 'HIKER'): void {
  const quoted = email.replaceAll("'", "''");
  sql(`UPDATE users SET role = '${role}' WHERE email = '${quoted}';`);
}
