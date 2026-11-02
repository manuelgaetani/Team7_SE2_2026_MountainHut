import { execFileSync } from 'node:child_process';

// Runs SQL on the Postgres database of the running docker compose stack.
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

// Changes the role of a user in the database so they can act as staff.
export function setUserRole(email: string, role: 'EMPLOYEE' | 'WARDEN' | 'HIKER'): void {
  const quoted = email.replaceAll("'", "''");
  sql(`UPDATE users SET role = '${role}' WHERE email = '${quoted}';`);
}
