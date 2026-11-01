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
  sql(`INSERT INTO slot_tables (slot_id, table_number, seats) VALUES ${toValues(slotId, seats)};`);
  return Number(slotId);
}

// A slot far in the future. The date is random because tests share the database.
export function createSlot(seats: number[]): number {
  const date = `DATE '2031-01-01' + ${randomInt(36_500)}`;
  return insertSlot(date, `TIME '19:00'`, `TIME '21:00'`, seats);
}

// A slot that starts in about one hour, too soon to book.
export function createImminentSlot(seats: number[]): number {
  const start = `(now() AT TIME ZONE 'Europe/Rome' + interval '1 hour' + ${randomInt(1800)} * interval '1 second')`;
  return insertSlot(`${start}::date`, `${start}::time(0)`, `TIME '23:59'`, seats);
}

export function deleteSlot(slotId: number): void {
  sql(`DELETE FROM booking_tables WHERE slot_id = ${slotId};
       DELETE FROM bookings WHERE slot_id = ${slotId};
       DELETE FROM slot_tables WHERE slot_id = ${slotId};
       DELETE FROM slots WHERE id = ${slotId};`);
}
