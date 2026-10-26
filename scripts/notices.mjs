// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Writes static/licenses.txt, the third-party licences the app serves
// (THIRD-PARTY-NOTICES.md); `--check` fails when it is out of date.
//
//   node scripts/notices.mjs [--check]
//
// From package-lock.json, not node_modules, so every machine writes the same:
// what npm installs differs by platform. A platform-specific binary is named
// with its licence and no text, since only its own platform installs it.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'static', 'licenses.txt');
const check = process.argv.includes('--check');

const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\b|[.\-_])/i;
const lf = (s) => s.replace(/\r\n?/g, '\n');
const RULE = '-'.repeat(78);

/** A package's licence as its manifest states it: the SPDX expression, or the old object/array forms. */
function licenseOf(entry, dir) {
  let value = entry.license;
  if (!value && existsSync(join(dir, 'package.json'))) {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    value = manifest.license ?? manifest.licenses;
  }
  if (Array.isArray(value)) return value.map((l) => (typeof l === 'string' ? l : l.type)).join(' OR ');
  if (value && typeof value === 'object') return value.type ?? 'UNKNOWN';
  return value || 'UNKNOWN';
}

const packages = new Map(); // `${name}@${version}` -> { name, version, license, section, dir }
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || entry.link) continue;
  const name = entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const key = `${name}@${entry.version}`;
  if (packages.has(key)) continue;
  const dir = join(ROOT, path);
  const section = entry.os || entry.cpu ? 'platform' : entry.dev || entry.devOptional ? 'tools' : 'runtime';
  packages.set(key, { name, version: entry.version, license: licenseOf(entry, dir), section, dir });
}

function block(pkg) {
  if (!existsSync(pkg.dir)) {
    throw new Error(`${pkg.name}@${pkg.version} is in package-lock.json but not installed — run npm ci first.`);
  }
  const files = readdirSync(pkg.dir).filter((f) => LICENSE_FILE.test(f)).sort();
  const texts = files.map((f) => lf(readFileSync(join(pkg.dir, f), 'utf8')).trimEnd());
  const body = texts.length ? texts.join('\n\n') : `(The package carries no licence file; its manifest states ${pkg.license}.)`;
  return `${RULE}\n${pkg.name}@${pkg.version} — ${pkg.license}\n${RULE}\n\n${body}\n`;
}

const byName = (a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name < b.name ? -1 : 1);
const of = (section) => [...packages.values()].filter((p) => p.section === section).sort(byName);

const out = [
  'owlgraph — third-party licences',
  '',
  'owlgraph is free software under the GNU Affero General Public License 3.0',
  '(LICENSE and PLUGIN-EXCEPTION.md in the source repository). It is built from',
  'and with the packages below, each under its own licence. This file is',
  'generated from package-lock.json by `npm run notices` (scripts/notices.mjs);',
  'never edit it by hand. Notices for third-party work copied into owlgraph',
  'itself (icons, the wordmark\'s typeface) are in THIRD-PARTY-NOTICES.md.',
  '',
  `== Runtime dependencies (${of('runtime').length}) ==`,
  '',
  ...of('runtime').map(block),
  `== Build and development tools (${of('tools').length}) ==`,
  '',
  ...of('tools').map(block),
  `== Platform-specific binaries (${of('platform').length}) ==`,
  '',
  'Installed only on the platform each is built for, so their licence texts',
  'are not reproduced here; each package carries its own. The libvips',
  'binaries are LGPL-3.0-or-later: see THIRD-PARTY-NOTICES.md for their source.',
  '',
  ...of('platform').map((p) => `${p.name}@${p.version} — ${p.license}`),
  '',
].join('\n');

if (check) {
  const current = existsSync(OUT) ? lf(readFileSync(OUT, 'utf8')) : '';
  if (current !== out) {
    console.error('static/licenses.txt is out of date with package-lock.json — run `npm run notices` and commit the result.');
    process.exit(1);
  }
  console.log(`notices: ok (${packages.size} packages)`);
} else {
  writeFileSync(OUT, out);
  console.log(`notices: wrote static/licenses.txt (${packages.size} packages)`);
}
