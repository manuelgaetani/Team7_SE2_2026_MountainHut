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

// A slot for the menu tests (MH-10). The list of previous menus keeps only the slots with the
// latest dates, so these slots get their own years (2900-2999), later than every other suite.
export function createMenuSlot(): number {
  const date = `DATE '2900-01-01' + ${randomInt(36_500)}`;
  return insertSlot(date, `TIME '12:00'`, `TIME '14:00'`, [4]);
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

// A slot that started about an hour ago, hut time, and is not over yet (MH-10: from its start
// on, its menu stays as it is). The end is random to the second, as for createImminentSlot.
export function createStartedSlot(seats: number[]): number {
  const start = `date_trunc('minute', now() AT TIME ZONE 'Europe/Rome' - interval '1 hour' - ${randomInt(30)} * interval '1 minute')`;
  const end = `TIME '23:59' + ${randomInt(60)} * interval '1 second'`;
  return insertSlot(`${start}::date`, `${start}::time(0)`, end, seats);
}

// Writes the menu of a slot straight in the database: the API refuses it once the slot has
// started (MH-10), but such slots can still have the menu written before.
export function setMenu(slotId: number, text: string): void {
  const quoted = text.replaceAll("'", "''");
  sql(`INSERT INTO menus (slot_id, text, updated_at) VALUES (${Number(slotId)}, '${quoted}', now())
       ON CONFLICT (slot_id) DO UPDATE SET text = EXCLUDED.text, updated_at = now();`);
}

// A slot that is already over.
export function createPastSlot(seats: number[]): number {
  const date = `DATE '2001-01-01' + ${randomInt(3_650)}`;
  return insertSlot(date, `TIME '19:00'`, `TIME '21:00'`, seats);
}

// The hut-local date (YYYY-MM-DD) and start time (HH:MM) of a slot, as the API expects them.
export function slotStart(slotId: number): { date: string; time: string } {
  const [date = '', time = ''] = sql(
    `SELECT to_char(date, 'YYYY-MM-DD') || '|' || to_char(start_time, 'HH24:MI')
     FROM slots WHERE id = ${Number(slotId)};`,
  ).split('|');
  return { date, time };
}

export function bookingStatus(bookingId: number): string {
  return sql(`SELECT status FROM bookings WHERE id = ${Number(bookingId)};`);
}

// The party requirements stored for a booking, in the order the hiker entered them (MH-05).
export function partyRequirements(
  bookingId: number,
): { restrictions: string[]; allergies: boolean; description: string }[] {
  const json = sql(
    `SELECT COALESCE(json_agg(json_build_object('restrictions', restrictions,
       'allergies', allergies, 'description', description) ORDER BY id), '[]')
     FROM party_requirements WHERE booking_id = ${Number(bookingId)};`,
  );
  return JSON.parse(json) as { restrictions: string[]; allergies: boolean; description: string }[];
}

// How many stored party requirements have exactly this description, in any booking (MH-05).
export function countPartyRequirements(description: string): number {
  const quoted = description.replaceAll("'", "''");
  return Number(sql(`SELECT count(*) FROM party_requirements WHERE description = '${quoted}';`));
}

// Moves a booking to another status, as the staff would when confirming or rejecting it.
export function setBookingStatus(
  bookingId: number,
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED',
): void {
  sql(`UPDATE bookings SET status = '${status}' WHERE id = ${Number(bookingId)};`);
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
const quote = (text: string): string => `'${text.replaceAll("'", "''")}'`;
const textArray = (items: string[]): string =>
  items.length === 0 ? `'{}'::text[]` : `ARRAY[${items.map(quote).join(', ')}]::text[]`;

// A predefined hike of the hut (MH-20), normally filled by the seed. The tests add their own,
// with a unique destination, so they do not depend on the seed.
export function createPredefinedHike(
  destination: string,
  route: string,
  passagePoints: string[],
): number {
  return Number(
    sql(`INSERT INTO predefined_hikes (destination, route, passage_points)
         VALUES (${quote(destination)}, ${quote(route)}, ${textArray(passagePoints)}) RETURNING id;`),
  );
}

export function deletePredefinedHike(id: number): void {
  sql(`DELETE FROM predefined_hikes WHERE id = ${Number(id)};`);
}

// A hike of the user written straight in the database (MH-20): the API registers only hikes
// that have not departed yet, so a past hike can only be made this way. Times are hut-local
// timestamps, "YYYY-MM-DD HH:MM".
export function insertHike(
  email: string,
  hike: { destination: string; route: string; departureAt: string; returnAt: string },
): number {
  return Number(
    sql(`INSERT INTO hikes (hiker_id, destination, route, departure_at, return_at)
         SELECT h.id, ${quote(hike.destination)}, ${quote(hike.route)},
                TIMESTAMP ${quote(hike.departureAt)}, TIMESTAMP ${quote(hike.returnAt)}
         FROM hikers h JOIN users u ON u.id = h.user_id WHERE u.email = ${quote(email)}
         RETURNING id;`),
  );
}

// Changes the role of a user in the database so they can act as staff.
export function setUserRole(email: string, role: 'EMPLOYEE' | 'WARDEN' | 'HIKER'): void {
  const quoted = email.replaceAll("'", "''");
  sql(`UPDATE users SET role = '${role}' WHERE email = '${quoted}';`);
}
