// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

// The script run with `--root` on a git tree of the test's own.

const SCRIPT = resolve(import.meta.dirname, 'license-headers.mjs');
const HEADER = '// SPDX-License-Identifier: AGPL-3.0-only\n// Copyright (C) 2026 Alexander Rensch\n// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.\n\n';
const SQL_HEADER = HEADER.replace(/^\/\//gm, '--');
const ADVICE = 'A migration carries the header from its first commit, before it is applied';

const TREE: Record<string, string> = {
  'src/headed.ts': `${HEADER}export const headed = 1;\n`,
  'src/bare.ts': 'export const bare = 1;\n',
  'migrations/0052_headed.sql': `${SQL_HEADER}create table u (id int);\n`,
  'migrations/0053_bare.sql': 'create table v (id int);\n',
};

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A git tree holding TREE with `changes` applied (a file set to null left out); new files are what the script lists as well as tracked ones. */
function tree(changes: Record<string, string | null> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'license-headers-'));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  for (const [path, text] of Object.entries({ ...TREE, ...changes })) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function run(root: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8');

describe('the licence header fixer', () => {
  it('adds the header to a source file without one, and leaves a migration without one as it is, listing it with what to do and failing', () => {
    const root = tree();
    const { status, output } = run(root);
    expect(status, output).toBe(1);
    expect(read(root, 'src/bare.ts')).toBe(`${HEADER}export const bare = 1;\n`);
    expect(read(root, 'migrations/0053_bare.sql')).toBe(TREE['migrations/0053_bare.sql']);
    expect(output).toContain('1 migration(s) without the licence header, left as they are:\n  - migrations/0053_bare.sql');
    expect(output).toContain(ADVICE);
    expect(output).toContain('This script never writes into migrations/: the runner refuses an applied migration that has changed.');
  });

  it('succeeds once every file without the header was one it could write, and the check then passes', () => {
    const root = tree({ 'migrations/0053_bare.sql': null });
    const fixed = run(root);
    expect(fixed.status, fixed.output).toBe(0);
    // Three files: the headed migration is one of them.
    expect(fixed.output).toContain('added the header to 1 of 3 files');
    const checked = run(root, '--check');
    expect(checked.status, checked.output).toBe(0);
    expect(checked.output).toContain('license-headers: ok (3 files)');
  });
});

describe('the licence header check', () => {
  it('changes nothing and fails, sending a source file to the fixer and a migration to its advice', () => {
    const root = tree();
    const { status, output } = run(root, '--check');
    expect(status, output).toBe(1);
    expect(read(root, 'src/bare.ts')).toBe(TREE['src/bare.ts']);
    expect(read(root, 'migrations/0053_bare.sql')).toBe(TREE['migrations/0053_bare.sql']);
    expect(output).toContain('1 file(s) without the licence header — run `npm run license-headers`:\n  - src/bare.ts');
    expect(output).toContain('1 migration(s) without the licence header, left as they are:\n  - migrations/0053_bare.sql');
    expect(output).toContain(ADVICE);
  });
});
