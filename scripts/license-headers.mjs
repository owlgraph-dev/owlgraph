// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Adds the licence header (README.md, "Licence") to every source file that
// lacks it; `--check` only lists them and fails. A migration is never written
// to, only listed. `--root` works on another git tree.
//
//   node scripts/license-headers.mjs [--check] [--root <dir>]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg !== -1 && process.argv[rootArg + 1] ? resolve(process.argv[rootArg + 1]) : join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const LINES = [
  'SPDX-License-Identifier: AGPL-3.0-only',
  'Copyright (C) 2026 Alexander Rensch',
  'This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.',
];

// A new migration is applied before `npm run check` runs, so writing the
// header then would edit an applied one: the runner refuses an applied
// migration whose text changed (platform/migrate.server.ts).
const MIGRATION = /^migrations\//;
const MIGRATION_ADVICE = [
  'A migration carries the header from its first commit, before it is applied: add it by hand to one no database has applied yet.',
  'This script never writes into migrations/: the runner refuses an applied migration that has changed.',
];

/** The header in a file's own comment syntax, with its own line ending. */
function headerFor(path, eol) {
  if (path.endsWith('.svelte')) return ['<!--', ...LINES.map((l) => `  ${l}`), '-->', ''].join(eol);
  if (path.endsWith('.css')) return ['/*', ...LINES.map((l) => ` * ${l}`), ' */', ''].join(eol);
  if (path.endsWith('.sql')) return [...LINES.map((l) => `-- ${l}`), '', ''].join(eol);
  return [...LINES.map((l) => `// ${l}`), '', ''].join(eol);
}

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const files = [...new Set([...git('ls-files'), ...git('ls-files', '--others', '--exclude-standard')])]
  .filter((f) => /\.(?:ts|js|mjs|cjs|svelte|css|sql)$/.test(f))
  .sort();

const missing = [];
const migrations = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(join(ROOT, file), 'utf8');
  } catch {
    continue; // deleted in the working tree, still in the index
  }
  if (text.split('\n', 8).some((line) => line.includes(LINES[0]))) continue;
  if (MIGRATION.test(file)) {
    migrations.push(file);
    continue;
  }
  missing.push(file);
  if (check) continue;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  // A shebang must stay the first line.
  const shebang = text.startsWith('#!') ? text.slice(0, text.indexOf('\n') + 1) : '';
  writeFileSync(join(ROOT, file), shebang + headerFor(file, eol) + text.slice(shebang.length));
}

if (check && missing.length) {
  console.error(`license-headers: ${missing.length} file(s) without the licence header — run \`npm run license-headers\`:`);
  for (const f of missing) console.error('  - ' + f);
} else if (!check) {
  console.log(`license-headers: added the header to ${missing.length} of ${files.length} files`);
}
if (migrations.length) {
  console.error(`license-headers: ${migrations.length} migration(s) without the licence header, left as they are:`);
  for (const f of migrations) console.error('  - ' + f);
  for (const line of MIGRATION_ADVICE) console.error(line);
}
if (migrations.length || (check && missing.length)) process.exit(1);
if (check) console.log(`license-headers: ok (${files.length} files)`);
