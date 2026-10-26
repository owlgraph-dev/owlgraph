// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Whether what git tracks is fit to publish (CONTRIBUTING.md, "Licence and
// sign-off"): no generated output, secret or private data.
//
//   node scripts/check-publication.mjs
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const SELF = 'scripts/check-publication.mjs';

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
const problems = [];
const report = (file, line, what) => problems.push(`${file}${line ? `:${line}` : ''}: ${what}`);

const FORBIDDEN_PATHS = [
  [/^(backups|build|test-results|playwright-report|node_modules|\.svelte-kit|\.claude)\//, 'a backup, generated output or local tooling'],
  [/(^|\/)\.env($|\.)(?!example$)(?!production\.example$)/, 'an environment file (only the .example files are published)'],
  [/^CLAUDE\.md$|^tests\/e2e\/\.auth\/|^tests\/e2e\/\.seed\.json$|^tests\/e2e\/\.servers\/|^src\/lib\/paraglide\//, 'a local or generated file'],
  [/\.(dump|sql\.gz|zip|tar|tgz|webm|mp4|log|har|pem|key|p12|pfx|trace)$/i, 'a dump, archive, recording, log or key file'],
];
// Any binary but the project's own images is working material or someone's data.
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|pdf|woff2?|ttf|otf)$/i;
const ALLOWED_BINARIES = new Set([
  'static/og-image.png', 'static/icon-192.png', 'static/icon-512.png', 'static/icon-maskable-512.png',
  'static/apple-touch-icon.png', 'static/favicon.ico',
]);
for (const file of tracked) {
  for (const [re, what] of FORBIDDEN_PATHS) if (re.test(file)) report(file, 0, `${what} must not be published`);
  if (BINARY.test(file) && !ALLOWED_BINARIES.has(file)) report(file, 0, "a binary file outside the project's own images");
}

// The lockfile's hashes look like keys; the dependencies' licence texts carry
// their authors' addresses.
const NOT_SECRETS = new Set(['package-lock.json', SELF]); // this file spells out the shapes it looks for
const NOT_ADDRESSES = new Set(['package-lock.json', 'static/licenses.txt']);

const SECRETS = [
  [/BEGIN [A-Z ]*PRIVATE KEY|ssh-(?:rsa|ed25519) AAAA/, 'a private key'],
  [/\b[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}\b/, 'an app-password shape'],
  [/APP_SECRET_KEY(?:_PREVIOUS)?=[A-Za-z0-9+/]/, 'a secret key value'],
  [/(?:POSTGRES|APP_DB)_PASSWORD=[A-Za-z0-9_.-]/, 'a database password value'],
  [/['"=: ][A-Za-z0-9+/]{43}=(?:['" ,;]|$)/, 'a 32-byte base64 key'],
  [/AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|github_pat_|glpat-|xox[baprs]-|sk-ant-|sk-[A-Za-z0-9]{20,}/, 'a cloud or service token'],
  [/bearer [A-Za-z0-9._~+/-]{20,}/i, 'a bearer token'],
];
const USER_PATH = /[A-Za-z]:[\\/]+Users[\\/]|\/c\/Users\/|AppData[\\/]|\/home\/[a-z][\w-]*\//;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const EXAMPLE_ADDRESS = /@(?:[a-z0-9-]+\.)*(?:example|test|invalid|localhost)(?:\.(?:com|org|net|de))?$|@localhost$|@[0-9.]+$|@users\.noreply\.github\.com$/i;
const AUTHOR_ADDRESS = 'rensch.alexander@gmail.com';
const AUTHOR_FILES = new Set(['package.json']);

for (const file of tracked) {
  if (BINARY.test(file) || !existsSync(join(ROOT, file))) continue;
  const lines = readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/);
  lines.forEach((text, i) => {
    const n = i + 1;
    if (!NOT_SECRETS.has(file)) for (const [re, what] of SECRETS) if (re.test(text)) report(file, n, what);
    if (USER_PATH.test(text) && file !== SELF) report(file, n, 'a personal file-system path');
    if (!NOT_ADDRESSES.has(file)) {
      for (const address of text.match(EMAIL) ?? []) {
        if (EXAMPLE_ADDRESS.test(address)) continue;
        if (address === AUTHOR_ADDRESS && (AUTHOR_FILES.has(file) || file === SELF)) continue;
        report(file, n, `an e-mail address that is not an example (${address})`);
      }
    }
  });
}

if (problems.length) {
  console.error(`check-publication: ${problems.length} problem(s)`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`check-publication: ok (${tracked.length} files)`);
