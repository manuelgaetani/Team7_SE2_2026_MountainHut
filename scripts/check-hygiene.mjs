// Repository hygiene checks run in CI (npm run hygiene):
//   - no merge conflict markers in tracked files;
//   - no focused tests (.only), which silently disable the rest of the suite;
//   - every skipped test (.skip) has a TODO(<ticket>) comment in the lines just above it.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TEST_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;
const CONFLICT_MARKER = /^(<<<<<<<|>>>>>>>)( |$)|^=======$/;
const FOCUSED = /\b(describe|it|test)\.only\b/;
const SKIPPED = /\b(describe|it|test)\.skip\b/;
const TODO = /TODO\([^)]+\)/;
const TODO_LOOKBACK = 5;

// Tracked files plus new files not yet added, so the check also works before committing
const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  {
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter((file) => file && !file.endsWith('package-lock.json'));

const errors = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted in the working tree
  }
  if (text.includes('\0')) continue; // binary

  const lines = text.split(/\r?\n/);
  const isTest = TEST_FILE.test(file);

  lines.forEach((line, i) => {
    const where = `${file}:${i + 1}`;

    // A bare "=======" is a valid Markdown heading underline, so only flag it next to the other markers
    if (CONFLICT_MARKER.test(line) && (line !== '=======' || text.includes('<<<<<<< '))) {
      errors.push(`${where}: merge conflict marker`);
    }

    if (!isTest) return;

    if (FOCUSED.test(line)) {
      errors.push(`${where}: focused test (.only)`);
    }

    if (SKIPPED.test(line)) {
      const above = lines.slice(Math.max(0, i - TODO_LOOKBACK), i + 1);
      if (!above.some((l) => TODO.test(l))) {
        errors.push(`${where}: skipped test without a TODO(<ticket>) comment above it`);
      }
    }
  });
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} hygiene problem(s) found.`);
  process.exit(1);
}

console.log('Hygiene checks passed.');
