// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The acceptance-test check, run by `npm run check` (docs/guides/testing.md,
// "Acceptance tests"). A spec's acceptance tests live in a folder named as the
// spec's file, under tests/acceptance/ or, for a plugin's spec, under that
// plugin's acceptance/ folder:
//   1. A test there starts its name with the id of a criterion of that spec,
//      `NNN.n `, and runs: none is skipped, a todo or the only one.
//   2. No test elsewhere starts its name with a criterion id.
//   3. A file there is of a kind the gate runs: unit, database or HTTP.
//   4. Every criterion of an implemented spec has a test that passes, or a
//      list item in the spec's implementation notes that begins with its id.
//   5. A spec has at most twice as many tests as criteria. A pin (`it.fails`)
//      marks a bug and is not counted.
// A spec whose criteria are not numbered is reported and held to nothing.
// `--root <dir>` checks another tree.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg !== -1 && process.argv[rootArg + 1] ? resolve(process.argv[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TESTS_PER_CRITERION = 2;
const ID = /^(\d{3})\.(\d+) /;
const posix = (p) => relative(ROOT, p).split(sep).join('/');
const dirs = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);

function walk(dir, out = []) {
  for (const entry of existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

// --- The specs: docs/features/NNN-<name>.md.

/** The lines of a `## <heading>` section, up to the next heading of that level. */
function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return end === -1 ? rest : rest.slice(0, end);
}

const specs = new Map(); // 'NNN' -> { name, status, criteria: Set<number>, excused: Set<number> }
const FEATURES = join(ROOT, 'docs', 'features');
for (const file of existsSync(FEATURES) ? readdirSync(FEATURES) : []) {
  const m = /^(\d{3})-.+\.md$/.exec(file);
  if (!m) continue;
  const text = readFileSync(join(FEATURES, file), 'utf8');
  const status = /^status:\s*(\S+)/m.exec(text)?.[1] ?? '';
  // A criterion is a numbered item at the margin; its other lines are indented.
  const criteria = new Set();
  for (const line of section(text, 'Acceptance criteria')) {
    const item = /^(\d+)\. /.exec(line);
    if (item) criteria.add(Number(item[1]));
  }
  const excused = new Set();
  for (const line of section(text, 'Implementation notes')) {
    const note = /^[-*]\s+\**(\d{3})\.(\d+)\b/.exec(line);
    if (note && note[1] === m[1]) excused.add(Number(note[2]));
  }
  specs.set(m[1], { name: file.replace(/\.md$/, ''), status, criteria, excused });
}

// --- The tests: every `it(…)` and `test(…)` with its name and its modifiers.

// A comment's text is no test; a `//` after a colon is an address.
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

/** The index after the bracket that closes the one at `open`, strings skipped. */
function afterBalanced(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < source.length && source[i] !== c; i++) if (source[i] === '\\') i++;
    } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i + 1;
  }
  return source.length;
}

// A modifier that takes arguments of its own before the test's: it.each(rows)('name', …).
const TAKES_ARGUMENTS = new Set(['each', 'for', 'skipIf', 'runIf']);

/** Every test a file declares: its name when it is a literal, its modifiers and its line. */
function testsOf(source) {
  const text = stripComments(source);
  const found = [];
  const call = /(?<![\w$.])(?:it|test)((?:\.[A-Za-z]+)*)\s*\(/g;
  let m;
  while ((m = call.exec(text))) {
    const modifiers = m[1] ? m[1].slice(1).split('.') : [];
    let at = call.lastIndex;
    if (modifiers.some((mod) => TAKES_ARGUMENTS.has(mod))) {
      at = afterBalanced(text, at - 1);
      const next = /^\s*\(/.exec(text.slice(at));
      if (!next) continue;
      at += next[0].length;
    }
    const quoted = /^\s*(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/.exec(text.slice(at));
    found.push({ name: quoted ? quoted[2] : null, modifiers, line: text.slice(0, m.index).split('\n').length });
  }
  return found;
}

// --- The acceptance folders.

const acceptanceRoots = [join(ROOT, 'tests', 'acceptance'), ...dirs(join(ROOT, 'src', 'lib', 'plugins')).map((id) => join(ROOT, 'src', 'lib', 'plugins', id, 'acceptance'))];
const folders = acceptanceRoots.flatMap((root) => dirs(root).map((name) => ({ name, dir: join(root, name) })));
const inAcceptance = (file) => acceptanceRoots.some((root) => !relative(root, file).startsWith('..'));

const GATED = /\.(?:int\.|http\.)?test\.ts$/;
const NOT_GATED = /\.svelte\.test\.ts$|\.spec\.ts$/;
const NOT_RUN = new Set(['skip', 'todo', 'only']);

const problems = [];
const counts = new Map(); // 'NNN' -> { tests, pins, proven: Set<number> }

for (const { name, dir } of folders) {
  const spec = /^(\d{3})-/.exec(name)?.[1];
  const known = spec ? specs.get(spec) : undefined;
  if (!known || known.name !== name) {
    problems.push(`${posix(dir)} is named after no spec: an acceptance folder is named as its spec's file in docs/features/`);
    continue;
  }
  const count = counts.get(spec) ?? counts.set(spec, { tests: 0, pins: 0, proven: new Set() }).get(spec);
  for (const file of walk(dir)) {
    const path = posix(file);
    if (NOT_GATED.test(file)) {
      problems.push(`${path} is of a kind the gate does not run: an acceptance test is a unit, a database or an HTTP test`);
      continue;
    }
    if (!GATED.test(file)) continue; // a helper beside the tests
    for (const { name: title, modifiers, line } of testsOf(readFileSync(file, 'utf8'))) {
      const id = title === null ? null : ID.exec(title);
      if (!id) {
        problems.push(`${path}:${line} names no criterion: a test here starts its name with its criterion's id, such as '${spec}.1 …'`);
        continue;
      }
      if (id[1] !== spec || !known.criteria.has(Number(id[2]))) {
        problems.push(`${path}:${line} names ${id[1]}.${id[2]}, which is no criterion of ${known.name}`);
        continue;
      }
      const notRun = modifiers.find((mod) => NOT_RUN.has(mod));
      if (notRun) {
        problems.push(`${path}:${line} is marked .${notRun}: an acceptance test runs in the gate, and a known bug is pinned with .fails`);
        continue;
      }
      if (modifiers.includes('fails')) count.pins++;
      else {
        count.tests++;
        count.proven.add(Number(id[2]));
      }
    }
  }
}

// --- Rule 2: an id in a name outside the folders.

for (const top of ['src', 'tests', 'scripts']) {
  for (const file of walk(join(ROOT, top))) {
    if (!/\.(?:test|spec)\.ts$/.test(file) || inAcceptance(file)) continue;
    for (const { name: title, line } of testsOf(readFileSync(file, 'utf8'))) {
      if (title !== null && ID.test(title)) {
        problems.push(`${posix(file)}:${line} starts its name with a criterion's id outside an acceptance folder: only an acceptance test carries one`);
      }
    }
  }
}

// --- Rules 4 and 5, per spec.

const summary = [];
for (const [spec, { name, status, criteria, excused }] of [...specs].sort()) {
  const count = counts.get(spec) ?? { tests: 0, pins: 0, proven: new Set() };
  if (criteria.size === 0) {
    summary.push(`${spec}: criteria not numbered`);
    continue;
  }
  if (status === 'implemented') {
    for (const n of [...criteria].sort((a, b) => a - b)) {
      if (!count.proven.has(n) && !excused.has(n)) {
        problems.push(`${spec}.${n} has no acceptance test that passes, and no implementation note of ${name} begins with its id to say why`);
      }
    }
  }
  const ceiling = TESTS_PER_CRITERION * criteria.size;
  if (count.tests > ceiling) {
    problems.push(`${name} has ${count.tests} acceptance tests for ${criteria.size} criteria, more than ${ceiling}: one test a criterion, more only where it lists cases`);
  }
  summary.push(`${spec}: ${count.tests} tests${count.pins ? ` and ${count.pins} pins` : ''} for ${criteria.size} criteria${status === 'implemented' ? '' : ` (${status || 'no status'})`}`);
}

if (problems.length) {
  console.error(`check-criteria: ${problems.length} problem(s)`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`check-criteria: ok (${summary.join('; ') || 'no specs'})`);
