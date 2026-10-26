// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Rules 11 and 12, the checker run with `--root` on a tree of the test's own; the
// plugin rules are src/lib/plugins/boundaries.test.ts's.

const CHECKER = resolve(import.meta.dirname, 'check-boundaries.mjs');

/** A tree the rule accepts: a shell module composing a feature, mounted by the root layout and read by the hooks. */
const CLEAN: Record<string, string> = {
  'src/lib/features/site/index.ts': "export const siteName = () => 'site';\n",
  'src/lib/features/site/components.ts': "export { default as Banner } from './components/Banner.svelte';\n",
  'src/lib/features/site/components/Banner.svelte': '<p>banner</p>\n',
  'src/lib/features/site/routes/load.server.ts': "import { siteName } from '$lib/features/site';\nexport const load = () => ({ name: siteName() });\n",
  'src/lib/shell/Frame.svelte': "<script lang=\"ts\">\n  import { Banner } from '$lib/features/site/components';\n  import { siteName } from '$lib/features/site';\n</script>\n<Banner />{siteName()}\n",
  'src/lib/shell/gate.ts': "import { load } from '$lib/features/site/routes/load.server';\nexport const gate = () => load();\n",
  'src/lib/platform/env.ts': 'export const env = {};\n',
  'src/routes/+layout.svelte': "<script lang=\"ts\">\n  import Frame from '$lib/shell/Frame.svelte';\n</script>\n<Frame />\n",
  'src/hooks.server.ts': "import { gate } from '$lib/shell/gate';\nexport const handle = () => gate();\n",
};

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Runs the checker on CLEAN with `changes` applied; returns its exit status and output. */
function check(changes: Record<string, string> = {}): { status: number | null; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'check-boundaries-'));
  roots.push(root);
  for (const [path, text] of Object.entries({ ...CLEAN, ...changes })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const run = spawnSync(process.execPath, [CHECKER, '--root', root], { encoding: 'utf8' });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

const REFUSED = 'The shell imported from below it';

describe('check-boundaries, rule 11: the shell sits above the features', () => {
  it('passes a shell that imports features, mounted by the routes and read by the hooks', () => {
    const { status, output } = check();
    expect(status, output).toBe(0);
  });

  it('refuses a feature module that imports the shell, naming the import', () => {
    const { status, output } = check({
      'src/lib/features/site/components/Banner.svelte': "<script lang=\"ts\">\n  import Frame from '$lib/shell/Frame.svelte';\n</script>\n<Frame />\n",
    });
    expect(status, output).toBe(1);
    expect(output).toContain(`${REFUSED}: lib/features/site/components/Banner imports '$lib/shell/Frame.svelte'`);
  });

  it("refuses a feature's route adapter that imports the shell", () => {
    const { status, output } = check({
      'src/lib/features/site/routes/load.server.ts': "import { gate } from '$lib/shell/gate';\nexport const load = () => gate();\n",
    });
    expect(status, output).toBe(1);
    expect(output).toContain(`${REFUSED}: lib/features/site/routes/load.server imports '$lib/shell/gate'`);
  });

  it('refuses a platform module that imports the shell', () => {
    const { status, output } = check({ 'src/lib/platform/env.ts': "import { gate } from '$lib/shell/gate';\nexport const env = { gate };\n" });
    expect(status, output).toBe(1);
    expect(output).toContain(`${REFUSED}: lib/platform/env imports '$lib/shell/gate'`);
  });

  it('counts a type-only import', () => {
    const { status, output } = check({
      'src/lib/shell/types.ts': 'export type Frame = { title: string };\n',
      'src/lib/features/site/index.ts': "import type { Frame } from '$lib/shell/types';\nexport const siteName = (f?: Frame) => f?.title ?? 'site';\n",
    });
    expect(status, output).toBe(1);
    expect(output).toContain(`${REFUSED}: lib/features/site/index imports '$lib/shell/types'`);
  });

  it("lets a feature's tests and e2e specs import the shell", () => {
    const { status, output } = check({
      'src/lib/features/site/Banner.svelte.test.ts': "import Frame from '$lib/shell/Frame.svelte';\nexport { Frame };\n",
      'src/lib/features/site/e2e/frame.spec.ts': "import { gate } from '$lib/shell/gate';\nexport { gate };\n",
    });
    expect(status, output).toBe(0);
  });
});

describe('check-boundaries, rule 12: only tests import the test harness', () => {
  it("lets a test, a spec and a spec's helper import it by $tests and by a relative path", () => {
    const { status, output } = check({
      'src/lib/features/site/site.test.ts': "import { txt } from '$tests/e2e/doc';\nexport { txt };\n",
      'src/lib/features/site/e2e/site.spec.ts': "import { test } from '../../../../../tests/e2e/fixtures';\nexport { test };\n",
      'src/lib/features/site/e2e/stub.ts': "import { posting } from '$tests/e2e/api';\nexport { posting };\n",
    });
    expect(status, output).toBe(0);
  });

  it('refuses a module of the app that imports it, naming the import', () => {
    const { status, output } = check({ 'src/lib/platform/env.ts': "import { txt } from '$tests/e2e/doc';\nexport const env = { txt };\n" });
    expect(status, output).toBe(1);
    expect(output).toContain("The test harness imported outside a test: lib/platform/env imports '$tests/e2e/doc'");
  });
});
