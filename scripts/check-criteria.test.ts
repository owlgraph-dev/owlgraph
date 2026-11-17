// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// The script run with `--root` on a tree of the test's own. A fixture's tests
// are put together by `t`, so no line of this file declares a test named after
// a criterion when the script checks the repository.

const SCRIPT = resolve(import.meta.dirname, 'check-criteria.mjs');
const lines = (...text: string[]) => `${text.join('\n')}\n`;
/** A test's declaration: `t('007.1 opens')`, or `t('007.1 opens', '.fails')` for a pin. */
const t = (name: string, modifier = '') => `${'i'}${'t'}${modifier}('${name}', () => {});`;

const spec = (status: string, notes: string[] = []) =>
  lines('---', `status: ${status}`, '---', '', '# 007. Doors', '', '## Acceptance criteria', '', 'What a door does:', '', '1. A door opens.', '2. A door closes,', '   and stays closed.', '', '## Implementation notes', '', ...notes);

const FOLDER = 'tests/acceptance/007-doors';
const TREE: Record<string, string> = {
  'docs/features/007-doors.md': spec('implemented'),
  'docs/features/_template.md': lines('---', 'status: draft', '---', '', '## Acceptance criteria', '', '1. Each an outcome.'),
  [`${FOLDER}/doors.int.test.ts`]: lines("import { it } from 'vitest';", t('007.1 a door opens'), t('007.2 a door closes and stays closed')),
  'src/lib/features/doors/doors.test.ts': lines("import { it } from 'vitest';", t('a hinge turns')),
};

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Runs the script on TREE with `changes` applied; returns its exit status and output. */
function check(changes: Record<string, string> = {}): { status: number | null; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'check-criteria-'));
  roots.push(root);
  for (const [path, text] of Object.entries({ ...TREE, ...changes })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const run = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe('the acceptance-test check', () => {
  it('passes a spec whose every criterion has a test in its folder, and counts them', () => {
    const { status, output } = check();
    expect(status, output).toBe(0);
    expect(output).toContain('007: 2 tests for 2 criteria');
  });

  it('refuses a test in the folder whose name starts with no criterion id, and one named after a criterion the spec does not have', () => {
    const unnamed = check({ [`${FOLDER}/more.test.ts`]: lines(t('a door creaks')) });
    expect(unnamed.status, unnamed.output).toBe(1);
    expect(unnamed.output).toContain(`${FOLDER}/more.test.ts:1 names no criterion`);

    const unknown = check({ [`${FOLDER}/more.test.ts`]: lines(t('007.3 a door locks'), t('008.1 a window opens')) });
    expect(unknown.status, unknown.output).toBe(1);
    expect(unknown.output).toContain(`${FOLDER}/more.test.ts:1 names 007.3, which is no criterion of 007-doors`);
    expect(unknown.output).toContain(`${FOLDER}/more.test.ts:2 names 008.1, which is no criterion of 007-doors`);
  });

  it('reads the name behind a modifier that takes arguments of its own', () => {
    const each = `${'i'}${'t'}.each([['wood'], ['steel']])('007.1 a %s door opens', () => {});`;
    const { status, output } = check({ [`${FOLDER}/doors.int.test.ts`]: lines(each, t('007.2 a door closes')) });
    expect(status, output).toBe(0);
  });

  it('refuses a criterion id at the start of a name outside an acceptance folder', () => {
    const { status, output } = check({ 'src/lib/features/doors/doors.test.ts': lines(t('007.1 a door opens')) });
    expect(status, output).toBe(1);
    expect(output).toContain("src/lib/features/doors/doors.test.ts:1 starts its name with a criterion's id outside an acceptance folder");
  });

  it('refuses a component test and a browser spec in the folder, and passes a helper beside the tests', () => {
    const helper = check({ [`${FOLDER}/fixture.ts`]: 'export const door = 1;\n' });
    expect(helper.status, helper.output).toBe(0);

    const { status, output } = check({
      [`${FOLDER}/Door.svelte.test.ts`]: lines(t('007.1 a door opens')),
      [`${FOLDER}/door.spec.ts`]: lines(t('007.1 a door opens')),
    });
    expect(status, output).toBe(1);
    expect(output).toContain(`${FOLDER}/Door.svelte.test.ts is of a kind the gate does not run`);
    expect(output).toContain(`${FOLDER}/door.spec.ts is of a kind the gate does not run`);
  });

  it('refuses a skipped test in the folder: an acceptance test runs', () => {
    const { status, output } = check({ [`${FOLDER}/more.test.ts`]: lines(t('007.1 a door opens', '.skip')) });
    expect(status, output).toBe(1);
    expect(output).toContain(`${FOLDER}/more.test.ts:1 is marked .skip`);
  });

  it('refuses a folder named after no spec', () => {
    const { status, output } = check({ 'tests/acceptance/009-windows/windows.test.ts': lines(t('009.1 a window opens')) });
    expect(status, output).toBe(1);
    expect(output).toContain('tests/acceptance/009-windows is named after no spec');
  });

  it("holds a plugin's folder to the same rules, wherever the plugin is", () => {
    const { status, output } = check({
      [`${FOLDER}/doors.int.test.ts`]: lines(t('007.1 a door opens')),
      'src/lib/plugins/acme/acceptance/007-doors/doors.test.ts': lines(t('007.2 a door closes'), t('a door creaks')),
    });
    expect(status, output).toBe(1);
    expect(output).toContain('src/lib/plugins/acme/acceptance/007-doors/doors.test.ts:2 names no criterion');
    expect(output).not.toContain('007.2 has no acceptance test');
  });

  it('refuses an implemented spec with a criterion no test proves, unless a note that begins with its id says why', () => {
    const one = lines("import { it } from 'vitest';", t('007.1 a door opens'));
    const untested = check({ [`${FOLDER}/doors.int.test.ts`]: one });
    expect(untested.status, untested.output).toBe(1);
    expect(untested.output).toContain('007.2 has no acceptance test that passes, and no implementation note of 007-doors begins with its id');

    const noted = check({
      [`${FOLDER}/doors.int.test.ts`]: one,
      'docs/features/007-doors.md': spec('implemented', ['- 007.2 has no acceptance test: only a browser shows it.']),
    });
    expect(noted.status, noted.output).toBe(0);
  });

  it('does not count a pin as proof, nor towards the ceiling', () => {
    const pinnedOnly = check({ [`${FOLDER}/doors.int.test.ts`]: lines(t('007.1 a door opens'), t('007.2 a door closes', '.fails')) });
    expect(pinnedOnly.status, pinnedOnly.output).toBe(1);
    expect(pinnedOnly.output).toContain('007.2 has no acceptance test that passes');

    const pins = Array.from({ length: 6 }, (_, i) => t(`007.2 a door stays closed, case ${i}`, '.fails'));
    const beside = check({ [`${FOLDER}/pins.int.test.ts`]: lines(...pins) });
    expect(beside.status, beside.output).toBe(0);
    expect(beside.output).toContain('007: 2 tests and 6 pins for 2 criteria');
  });

  it('refuses more than two tests a criterion across a spec', () => {
    const many = Array.from({ length: 5 }, (_, i) => t(`007.1 a door opens, case ${i}`));
    const { status, output } = check({ [`${FOLDER}/doors.int.test.ts`]: lines(...many, t('007.2 a door closes')) });
    expect(status, output).toBe(1);
    expect(output).toContain('007-doors has 6 acceptance tests for 2 criteria, more than 4');
  });

  it('asks nothing of a spec in progress beyond its tests naming its criteria, and nothing of one whose criteria are not numbered', () => {
    const inProgress = check({
      'docs/features/007-doors.md': spec('in-progress'),
      [`${FOLDER}/doors.int.test.ts`]: lines(t('007.1 a door opens')),
    });
    expect(inProgress.status, inProgress.output).toBe(0);
    expect(inProgress.output).toContain('007: 1 tests for 2 criteria (in-progress)');

    const unnumbered = check({
      'docs/features/006-roofs.md': lines('---', 'status: implemented', '---', '', '## Acceptance criteria', '', '- A roof keeps the rain out.'),
    });
    expect(unnumbered.status, unnumbered.output).toBe(0);
    expect(unnumbered.output).toContain('006: criteria not numbered');
  });
});
