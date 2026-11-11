const MAX_DB_ID = 2_147_483_647;

// A slot id from the URL: a positive integer the database can hold, otherwise null.
export function parseSlotId(raw: string | undefined): number | null {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return id <= MAX_DB_ID ? id : null;
}
