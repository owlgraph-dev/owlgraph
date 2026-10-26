// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// The script run with `--root` on a tree of the test's own. The fixture's text
// is built from joined lines, so none of this file's lines reads as a comment
// when the script checks the repository.

const SCRIPT = resolve(import.meta.dirname, 'check-paths.mjs');
const lines = (...text: string[]) => `${text.join('\n')}\n`;

const TREE: Record<string, string> = {
  'src/lib/platform/csp.ts': 'export const csp = 1;\n',
  'src/lib/features/content/blocks/catalog.ts': 'export const blocks = [];\n',
  'src/routes/[[namespace=namespace]]/[slug]/+page.svelte': '<p>page</p>\n',
  'scripts/tool.mjs': lines('// Reads `src/lib/platform/csp.ts`.', 'export const tool = 1;'),
  'docs/guide.md': lines('# Guide', '', 'The policy lives in `src/lib/platform/csp.ts`.'),
};

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Runs the script on TREE with `changes` applied; returns its exit status and output. */
function check(changes: Record<string, string> = {}): { status: number | null; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'check-paths-'));
  roots.push(root);
  for (const [path, text] of Object.entries({ ...TREE, ...changes })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const run = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe('the path check', () => {
  it('passes paths that resolve: from the repository root, from the file itself and as a module specifier', () => {
    const { status, output } = check({
      'src/lib/platform/policy.ts': lines('/**', ' * Beside `./csp.ts`, read by `scripts/tool.mjs` and the page', ' * (`src/routes/[[namespace=namespace]]/[slug]/+page.svelte`).', ' */', 'export const policy = 1;'),
      'docs/guide.md': lines('# Guide', '', 'The policy lives in `src/lib/platform/csp` (`../src/lib/platform/csp.ts`).'),
    });
    expect(status, output).toBe(0);
    expect(output).toContain('check-paths: ok');
  });

  it('reports a path that does not exist with its file and line, in a doc, its code block and a comment', () => {
    const { status, output } = check({
      'docs/guide.md': lines('# Guide', '', 'The policy lives in `src/lib/platform/csp.ts`.', '', 'It moved to `src/lib/shell/csp.ts`.', '', '```sh', 'node scripts/gone.mjs', '```'),
      'src/lib/platform/csp.ts': lines('// Read by `src/lib/features/content/render.server.ts`.', 'export const csp = 1;'),
    });
    expect(status, output).toBe(1);
    expect(output).toContain('docs/guide.md:5: src/lib/shell/csp.ts');
    expect(output).toContain('docs/guide.md:8: scripts/gone.mjs');
    expect(output).toContain('src/lib/platform/csp.ts:1: src/lib/features/content/render.server.ts');
  });

  it('reads comments only, never code', () => {
    const { status, output } = check({
      'src/lib/platform/csp.ts': lines('export const doc = `src/lib/platform/gone.ts`;', 'export const csp = 1;'),
    });
    expect(status, output).toBe(0);
  });

  it('resolves the src/lib/ shorthand, a feature-relative path and $lib/, and reports one of them that names nothing', () => {
    const passing = check({
      'docs/guide.md': lines('# Guide', '', 'The policy (`platform/csp.ts`, `$lib/platform/csp`) and the blocks (`content/blocks/catalog.ts`).'),
    });
    expect(passing.status, passing.output).toBe(0);

    const { status, output } = check({
      'docs/guide.md': lines('# Guide', '', 'The policy (`platform/csp.ts`, `platform/gone.ts`, `$lib/platform/gone`) and the blocks (`content/blocks/gone.ts`).'),
    });
    expect(status, output).toBe(1);
    expect(output).toContain('docs/guide.md:3: platform/gone.ts');
    expect(output).toContain('docs/guide.md:3: $lib/platform/gone');
    expect(output).toContain('docs/guide.md:3: content/blocks/gone.ts');
    expect(output).not.toContain(': platform/csp.ts');
  });

  it('ignores placeholders and patterns', () => {
    const { status, output } = check({
      'docs/guide.md': lines(
        '# Guide',
        '',
        'A feature is `src/lib/features/<feature>/`; its specs are `src/**/e2e/*.spec.ts`.',
        'The next migration is `migrations/00NN_description.sql`.',
        'A page is `src/routes/[[namespace]]/[slug]/+page.svelte`; a guide is `docs/[slug].md`.'
      ),
    });
    expect(status, output).toBe(0);
  });
});

describe('the link check', () => {
  const PAGES = {
    'docs/guides/setup.md': lines('# Setup', '', '## `DATABASE_URL` — host-side only', '', '## Notes', '', '## Notes'),
    'LICENSE': 'licence\n',
  };

  it("passes a relative link to a file, and an anchor to one of its headings by GitHub's ids, in a page of a docs subfolder", () => {
    const { status, output } = check({
      ...PAGES,
      'docs/architecture/overview.md': lines(
        '# Overview',
        '',
        'See [the setup](../guides/setup.md#database_url--host-side-only), its [second notes](../guides/setup.md#notes-1),',
        '[the licence](../../LICENSE), [this page](#overview) and [a site](https://example.org/gone.md).'
      ),
    });
    expect(status, output).toBe(0);
    // The site's link is not the repository's, so not counted.
    expect(output).toMatch(/check-paths: ok \(.*, 4 links,/);
  });

  it('reports a link to a file that is not there, and an anchor that names no heading, with their file and line', () => {
    const { status, output } = check({
      ...PAGES,
      'docs/architecture/overview.md': lines('# Overview', '', 'See [the setup](setup.md).', '', 'And [its notes](../guides/setup.md#more-notes).'),
    });
    expect(status, output).toBe(1);
    expect(output).toContain('docs/architecture/overview.md:3: setup.md');
    expect(output).toContain('docs/architecture/overview.md:5: ../guides/setup.md#more-notes');
  });

  it("passes a docs page's anchor or quoted section in a comment or a string, a quote across a line break included", () => {
    const { status, output } = check({
      ...PAGES,
      'src/lib/platform/policy.ts': lines(
        '// Set up as docs/guides/setup.md, "Notes" says, and docs/guides/setup.md#notes-1.',
        '// The variable (docs/guides/setup.md, "`DATABASE_URL` —',
        '// host-side only").',
        "export const hint = 'See docs/guides/setup.md, \"Setup\".';"
      ),
    });
    expect(status, output).toBe(0);
    expect(output).toMatch(/, 4 sections\)/);
  });

  it('reports a quoted section or an anchor of a docs page that names no heading', () => {
    const { status, output } = check({
      ...PAGES,
      'src/lib/platform/policy.ts': lines('// See docs/guides/setup.md, "Old notes" and', '// docs/guides/setup.md#gone.', 'export const policy = 1;'),
    });
    expect(status, output).toBe(1);
    expect(output).toContain('src/lib/platform/policy.ts:1: docs/guides/setup.md, "Old notes"');
    expect(output).toContain('src/lib/platform/policy.ts:2: docs/guides/setup.md#gone');
  });

  it("checks a root page's quoted section too, but not another folder's page of the same name", () => {
    const pages = { ...PAGES, 'NOTES.md': lines('# Notes', '', '## Licence'), 'src/lib/platform/NOTES.md': lines('# Platform') };
    const passing = check({ ...pages, 'src/lib/platform/policy.ts': lines('// As NOTES.md, "Licence" says; src/lib/platform/NOTES.md, "Licence" is not the root one.', 'export const policy = 1;') });
    expect(passing.status, passing.output).toBe(0);

    const { status, output } = check({ ...pages, 'src/lib/platform/policy.ts': lines('// As NOTES.md, "Publishing" says.', 'export const policy = 1;') });
    expect(status, output).toBe(1);
    expect(output).toContain('src/lib/platform/policy.ts:1: NOTES.md, "Publishing"');
  });

  it('reads no link inside code', () => {
    const { status, output } = check({
      ...PAGES,
      'docs/architecture/overview.md': lines('# Overview', '', 'Written as `[text](gone.md)`.', '', '```md', '[text](gone.md)', '```'),
    });
    expect(status, output).toBe(0);
  });
});
