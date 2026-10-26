// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Every path the docs and the code comments write in backticks must exist
// (part of `npm run check`). It reads the markdown pages,
// a fenced block word by word, and the comment lines of src/, tests/, scripts/
// and the root configs; never migrations/, whose comments keep their day's paths.
// A path starts from a root (a top folder, lib/, a folder of src/lib/ or of
// src/lib/features/, $lib/, ./, ../) and resolves as written or as a module;
// [slug] stands for any route parameter folder, and a placeholder (<…>, {…}, *,
// …, ?, 00NN) is no path. A markdown page's relative links must reach a file
// too, and a #anchor a heading of it, by GitHub's rule for a heading's id; so
// must a docs or root page's #anchor or quoted section ("docs/x.md, "Section"") in any
// of those files' text, comments and strings alike, a quote across a line
// break included. `--root <dir>` checks another tree.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg !== -1 && process.argv[rootArg + 1] ? resolve(process.argv[rootArg + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Paths meant not to exist, each with its reason: a path that moved is fixed, not allowed.
const ALLOWED = [
  { path: /^\.\/backups\//, reason: 'the dumps the backup and restore commands in docs/guides/backup.md write and read (gitignored)' },
  { path: /^tests\/e2e\/\.(?:seed\.json|servers\/)/, reason: "the e2e harness's run state, which a run writes (gitignored), so CI's check runs before it exists" },
  { path: /^migrations\/0002_add_some_index\.no-tx\.sql$/, reason: "docs/architecture/migrations.md's example of a migration run outside a transaction" },
  { path: /^\$lib\/server$/, reason: "SvelteKit's server-only folder, named for the rule it enforces; this codebase marks a server module *.server.ts instead" },
];

const MARKDOWN_ROOT = ['README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'SECURITY.md'];
const CODE = /\.(?:ts|js|mjs|cjs|svelte|css|html)$/;
const ROOT_CONFIG = /^[^/]+\.config\.(?:ts|js|mjs|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', join('src', 'lib', 'paraglide')]);
const EXTENSIONS = ['', '.ts', '.js', '.svelte', '/index.ts'];
const PLACEHOLDER = /[<>{}*…?|]|\.\.\.|(?<![A-Za-z])0*N{1,4}(?![A-Za-z])/;
const SPAN = /`([^`\n]+)`/g;
const WORD_BREAK = /[\s'"`,;()]+/;
const LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
// A docs page, or one at the root (README.md, CONTRIBUTING.md, …) named on its own.
const PAGE = String.raw`(?:docs\/[a-z0-9/-]+|(?<![\w./-])[A-Z][A-Z-]*)\.md`;
const SECTION_START = new RegExp(String.raw`${PAGE}(?:#[a-z0-9-]+|,? \(?["“])`);
const SECTION = new RegExp(String.raw`(${PAGE})(?:#([a-z0-9-]+)|,? \(?["“]([^"”]{2,80})["”])`, 'g');
const COMMENT_LEAD = /^\s*(?:\/\/|\/?\*|#|--|<!--)?\s*/;

const folders = (dir) =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];

// The roots a path starts from: [base folder, the first segments that resolve there].
const ROOTS = [
  [ROOT, new Set(['src', 'tests', 'scripts', 'docs', 'migrations', 'static', 'messages', 'project.inlang', '.github'])],
  [join(ROOT, 'src'), new Set(['lib'])],
  [join(ROOT, 'src', 'lib'), new Set(folders(join(ROOT, 'src', 'lib')))],
  [join(ROOT, 'src', 'lib', 'features'), new Set(folders(join(ROOT, 'src', 'lib', 'features')))],
];

function walk(dir, keep, out = []) {
  for (const entry of existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name) || SKIP_DIRS.has(relative(ROOT, full))) continue;
      walk(full, keep, out);
    } else if (keep(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function routeParams(dir) {
  try {
    return readdirSync(dir).filter((name) => name.startsWith('[')).map((name) => join(dir, name));
  } catch {
    return [];
  }
}

/** Whether `path` exists under `base`; null when a bracketed segment matches no route folder. */
function existsUnder(base, path) {
  const segments = path.split('/').filter(Boolean);
  let at = [base];
  for (const [i, segment] of segments.entries()) {
    if (segment.startsWith('[')) {
      at = at.flatMap(routeParams);
      if (!at.length) return null;
      continue;
    }
    const names = i === segments.length - 1 ? EXTENSIONS.map((ext) => segment + ext) : [segment];
    at = at.flatMap((dir) => names.map((name) => join(dir, name)).filter((candidate) => existsSync(candidate)));
    if (!at.length) return false;
  }
  return true;
}

/** The folders a word resolves against, or null when the word is no path. */
function basesOf(word, file) {
  if (word.startsWith('./')) return [dirname(file), ROOT];
  if (word.startsWith('../')) return [dirname(file)];
  if (word.startsWith('$lib/')) return [join(ROOT, 'src', 'lib')];
  const first = word.slice(0, word.indexOf('/'));
  const bases = ROOTS.filter(([, names]) => names.has(first)).map(([base]) => base);
  return bases.length ? bases : null;
}

const isAllowed = (word) => ALLOWED.some(({ path }) => path.test(word));

const problems = [];
let checkedPaths = 0;
let checkedLinks = 0;
let checkedSections = 0;

function checkText(text, file, line) {
  for (const raw of text.split(WORD_BREAK)) {
    // A line reference, an anchor or a sentence's full stop is not part of the path.
    const word = raw.replace(/#.*$/, '').replace(/:\d+(?:-\d+)?$/, '').replace(/[.:]+$/, '');
    if (!word.includes('/') || word.startsWith('/') || PLACEHOLDER.test(word)) continue;
    const bases = basesOf(word, file);
    if (!bases) continue;
    const found = bases.map((base) => existsUnder(base, word.replace(/^\$lib\//, '')));
    if (!found.includes(true) && found.includes(null)) continue;
    checkedPaths++;
    if (found.includes(true) || isAllowed(word)) continue;
    problems.push(`${relative(ROOT, file).split(sep).join('/')}:${line}: ${word}`);
  }
}

const anchors = new Map();

/** The ids of a page's headings as GitHub derives them: the text lower-cased, punctuation dropped, each space a hyphen, a repeat suffixed -1, -2, …. */
function anchorsOf(file) {
  if (anchors.has(file)) return anchors.get(file);
  const ids = new Set();
  const seen = new Map();
  let fenced = false;
  for (const text of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(text)) fenced = !fenced;
    const heading = !fenced && /^#{1,6}\s+(.*?)\s*$/.exec(text);
    if (!heading) continue;
    const id = heading[1]
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replace(/ /g, '-');
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    ids.add(n ? `${id}-${n}` : id);
  }
  anchors.set(file, ids);
  return ids;
}

function checkLinks(text, file, line) {
  for (const [, target] of text.replace(SPAN, '').matchAll(LINK)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) continue;
    const hash = target.indexOf('#');
    const path = decodeURI(hash === -1 ? target : target.slice(0, hash));
    const anchor = hash === -1 ? '' : decodeURIComponent(target.slice(hash + 1));
    const dest = path ? resolve(dirname(file), path) : file;
    checkedLinks++;
    const reaches = existsSync(dest) && (!anchor || !dest.endsWith('.md') || anchorsOf(dest).has(anchor));
    if (!reaches) problems.push(`${relative(ROOT, file).split(sep).join('/')}:${line}: ${target}`);
  }
}

/** The anchor's or quoted section's heading of a docs page named in `file`'s text; a quote may end on the next line. */
function checkSections(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((text, i) => {
    if (!SECTION_START.test(text)) return;
    const joined = `${text} ${(lines[i + 1] ?? '').replace(COMMENT_LEAD, '')}`;
    for (const { 0: all, 1: page, 2: anchor, 3: name, index } of joined.matchAll(SECTION)) {
      if (index >= text.length || !all) continue;
      const dest = join(ROOT, page);
      if (!existsSync(dest)) continue; // the path check reports a page that is not there
      checkedSections++;
      const id = anchor ?? name.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
      if (!anchorsOf(dest).has(id)) problems.push(`${relative(ROOT, file).split(sep).join('/')}:${i + 1}: ${page}${anchor ? `#${anchor}` : `, "${name}"`}`);
    }
  });
}

function checkMarkdown(file) {
  let fenced = false;
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((text, i) => {
      if (/^\s*(?:```|~~~)/.test(text)) fenced = !fenced;
      else if (fenced) checkText(text, file, i + 1);
      else {
        for (const span of text.matchAll(SPAN)) checkText(span[1], file, i + 1);
        checkLinks(text, file, i + 1);
      }
    });
}

function checkComments(file) {
  let closer = null;
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((text, i) => {
      const line = text.trim();
      let comment = closer !== null;
      if (closer !== null) {
        if (line.includes(closer)) closer = null;
      } else if (line.startsWith('/*')) {
        comment = true;
        if (!line.includes('*/', 2)) closer = '*/';
      } else if (line.startsWith('<!--')) {
        comment = true;
        if (!line.includes('-->', 4)) closer = '-->';
      } else {
        comment = line.startsWith('//') || line.startsWith('*');
      }
      if (comment) for (const span of text.matchAll(SPAN)) checkText(span[1], file, i + 1);
    });
}

const filesIn = (dir, keep) => (existsSync(dir) ? readdirSync(dir) : []).filter((name) => keep(name) && statSync(join(dir, name)).isFile()).map((name) => join(dir, name));

const markdown = [
  ...walk(join(ROOT, 'docs'), (name) => name.endsWith('.md')),
  ...filesIn(ROOT, (name) => MARKDOWN_ROOT.includes(name)),
];
const code = [
  ...['src', 'tests', 'scripts'].flatMap((dir) => walk(join(ROOT, dir), (name) => CODE.test(name))),
  ...filesIn(ROOT, (name) => ROOT_CONFIG.test(name)),
];

for (const file of markdown) checkMarkdown(file);
for (const file of code) checkComments(file);
for (const file of [...markdown, ...code]) checkSections(file);

if (problems.length) {
  console.error(`check-paths: ${problems.length} path(s) or link(s) that reach nothing`);
  for (const p of problems) console.error('  - ' + p);
  console.error(
    '  Point each at the file or heading it means (git log --name-status -- <old path> shows where a moved file went),\n' +
      '  or reword the sentence when the file is gone. A path meant not to exist goes in ALLOWED in\n' +
      '  scripts/check-paths.mjs, with its reason.'
  );
  process.exit(1);
}
console.log(`check-paths: ok (${markdown.length + code.length} files, ${checkedPaths} paths, ${checkedLinks} links, ${checkedSections} sections)`);
