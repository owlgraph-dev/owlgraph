// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The console guardrail, run by `npm run check` (docs/architecture/logging.md, "Guardrail"):
// src/ logs through the logger and its catalogue, never console, whose lines are
// unredacted and uncorrelated. Exempt: generated paraglide output and tests;
// scripts/ isn't scanned, as stdout is a CLI's interface. A script rather than
// ESLint: one rule doesn't justify a toolchain.
// `// log-allow: <reason>` on the line or the one above admits a call; needing
// it twice in a file means the catalogue lacks an event.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const EXEMPT_DIRS = [join('lib', 'paraglide'), `${sep}e2e${sep}`];
const EXEMPT_FILE = /\.(test|spec)\.ts$/;
const EXTENSIONS = ['.ts', '.svelte', '.js'];

// console['log'] and a destructured console count too.
const CONSOLE = /\bconsole\s*(?:\.\s*[a-zA-Z]+|\[)/g;
const DESTRUCTURED = /\b(?:const|let|var)\s*\{[^}]*\}\s*=\s*console\b/g;
const ALLOW = /\/\/\s*log-allow:\s*\S/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function isExempt(file) {
  const rel = relative(ROOT, file);
  if (EXEMPT_FILE.test(rel)) return true;
  return EXEMPT_DIRS.some((fragment) => rel.includes(fragment));
}

// A console call a comment mentions is no call.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const files = statSync(SRC, { throwIfNoEntry: false }) ? walk(SRC) : [];
const problems = [];
let allowed = 0;
let checked = 0;

for (const file of files) {
  if (isExempt(file)) continue;
  checked++;
  const source = readFileSync(file, 'utf8');
  if (!source.includes('console')) continue;
  const rawLines = source.split('\n');
  const lines = stripComments(source).split('\n');
  const rel = relative(ROOT, file).split(sep).join('/');

  for (let i = 0; i < lines.length; i++) {
    CONSOLE.lastIndex = 0;
    DESTRUCTURED.lastIndex = 0;
    if (!CONSOLE.test(lines[i]) && !DESTRUCTURED.test(lines[i])) continue;
    if (ALLOW.test(rawLines[i]) || (i > 0 && ALLOW.test(rawLines[i - 1]))) {
      allowed++;
      continue;
    }
    problems.push(`${rel}:${i + 1}  ${rawLines[i].trim().slice(0, 100)}`);
  }
}

if (problems.length) {
  console.error(`check-console: ${problems.length} problem(s)`);
  for (const p of problems) console.error('  - ' + p);
  console.error(
    '  Log through $lib/platform/logger.server: logEvent(locals.log, "<catalog.event>", { … }).\n' +
      '  The event must exist in the catalog (logger.server.ts) and in docs/architecture/logging.md.\n' +
      '  See docs/architecture/logging.md, "Guardrail" (allow-list, the log-allow escape hatch).'
  );
  process.exit(1);
}
console.log(`check-console: ok (${checked} files${allowed ? `, ${allowed} allow-listed line(s)` : ''})`);
