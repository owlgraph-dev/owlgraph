// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { baselineState, markAppliedRefusal, migrationChecksums, readBaseline, restoreVerdict, type Baseline, type MigrationRow } from './baseline.server';

// Three migrations a baseline replaces, and the rows a database holds of them.
const OLD = {
  '0001_people.sql': 'create table people (id int primary key);\n',
  '0002_pets.sql': 'create table pets (id int primary key);\n',
  '0003_toys.sql': 'create table toys (id int primary key);\n',
};
type OldFile = keyof typeof OLD;
const NAMES = Object.keys(OLD) as OldFile[];
const version = (filename: string) => filename.slice(0, 4);

function header(files: readonly OldFile[] = NAMES, tag = 'pre-baseline') {
  const lines = files.map((f) => `-- replaces: ${version(f)} ${f} ${migrationChecksums(OLD[f]).join(' ')}`);
  return `-- The baseline.\n--\n-- upgrade-through: ${tag}\n${lines.join('\n')}\n\ncreate table people (id int primary key);\n`;
}
const BASELINE_FILE = { version: '0001', filename: '0001_baseline.sql', contents: header() };
const LATER = { version: '0004', filename: '0004_later.sql', contents: 'select 1;\n' };
const baseline = readBaseline([BASELINE_FILE, LATER]) as Baseline;

/** A row as the runner records `filename`: its LF checksum, or its CRLF one. */
const row = (filename: OldFile, endings: 'lf' | 'crlf' = 'lf'): MigrationRow => ({
  version: version(filename),
  filename,
  checksum: migrationChecksums(OLD[filename])[endings === 'lf' ? 0 : 1],
});
const baselineRow = (endings: 'lf' | 'crlf' = 'lf'): MigrationRow => ({ version: '0001', filename: '0001_baseline.sql', checksum: baseline.checksums[endings === 'lf' ? 0 : 1] });

const PARTIAL =
  'Refusing to migrate: this database predates 0001_baseline.sql and has applied 2 of the 3 migrations it replaces, the last 0002_pets.sql. ' +
  'Nothing was changed. Upgrade it in two steps, with a backup before each: first with the release tagged pre-baseline, whose migrate applies the rest up to 0003_toys.sql; ' +
  'then with this release, whose migrate records 0001_baseline.sql in their place. See docs/guides/upgrading.md, "Across the baseline".';

describe('a baseline header', () => {
  it('gives the file its entries, in order, with both checksums, and its tag', () => {
    expect(baseline).toEqual({
      version: '0001',
      filename: '0001_baseline.sql',
      checksums: migrationChecksums(BASELINE_FILE.contents),
      upgradeThrough: 'pre-baseline',
      replaces: NAMES.map((f) => ({ version: version(f), filename: f, checksums: migrationChecksums(OLD[f]) })),
    });
    expect(baseline.replaces[0].checksums[1]).not.toBe(baseline.replaces[0].checksums[0]);
  });

  it('reads the same from a CRLF checkout', () => {
    const crlf = { ...BASELINE_FILE, contents: BASELINE_FILE.contents.replace(/\n/g, '\r\n') };
    expect(readBaseline([crlf])).toEqual(baseline);
  });

  it('is absent from a folder whose lowest file has none: no baseline', () => {
    expect(readBaseline([{ version: '0001', filename: '0001_people.sql', contents: OLD['0001_people.sql'] }, LATER])).toBeNull();
    expect(readBaseline([])).toBeNull();
  });

  it.each([
    { what: 'a malformed replaces line', line: '-- replaces: 0002 0002_pets.sql abc def', message: 'Malformed baseline header, line 6 of 0001_baseline.sql: -- replaces: 0002 0002_pets.sql abc def' },
    { what: 'a replaces line whose file is another version’s', line: `-- replaces: 0005 0002_pets.sql ${'a'.repeat(64)} ${'b'.repeat(64)}`, message: 'Malformed baseline header, line 6 of 0001_baseline.sql: 0002_pets.sql is not the file of version 0005.' },
    { what: 'a repeated version', line: `-- replaces: 0002 0002_pets.sql ${'a'.repeat(64)} ${'b'.repeat(64)}`, message: 'Baseline header repeats version 0002, line 6 of 0001_baseline.sql' },
    { what: 'a second upgrade-through line', line: '-- upgrade-through: v2', message: 'Baseline header repeats its upgrade-through line, line 6 of 0001_baseline.sql: -- upgrade-through: v2' },
    { what: 'a malformed upgrade-through line', line: '-- upgrade-through:', message: 'Malformed baseline header, line 6 of 0001_baseline.sql: -- upgrade-through:' },
  ])('throws on $what, naming the line', ({ line, message }) => {
    // Inserted as line 6, after the replaces lines of 0001 and 0002.
    const lines = BASELINE_FILE.contents.split('\n');
    lines.splice(5, 0, line);
    expect(() => readBaseline([{ ...BASELINE_FILE, contents: lines.join('\n') }])).toThrow(message);
  });

  it('throws without its upgrade-through line, and with nothing it replaces', () => {
    expect(() => readBaseline([{ ...BASELINE_FILE, contents: BASELINE_FILE.contents.replace(/^-- upgrade-through: .*\n/m, '') }])).toThrow(
      'Baseline header of 0001_baseline.sql has no "-- upgrade-through: <tag>" line.'
    );
    expect(() => readBaseline([{ ...BASELINE_FILE, contents: '-- upgrade-through: pre-baseline\nselect 1;\n' }])).toThrow(
      'Baseline header of 0001_baseline.sql has no "-- replaces:" line.'
    );
  });

  it('throws on a header line in any file but the lowest-numbered one, naming it', () => {
    const later = { ...LATER, contents: `select 1;\n-- replaces: 0002 0002_pets.sql ${'a'.repeat(64)} ${'b'.repeat(64)}\n` };
    expect(() => readBaseline([BASELINE_FILE, later])).toThrow('A baseline header belongs in the lowest-numbered migration only, not on line 2 of 0004_later.sql');
    expect(() => readBaseline([{ ...BASELINE_FILE, contents: 'select 1;\n' }, { ...LATER, contents: '-- upgrade-through: x\n' }])).toThrow(
      'not on line 1 of 0004_later.sql'
    );
  });
});

describe('what a database’s rows make of the baseline', () => {
  it('is nothing without a baseline, whatever is recorded', () => {
    expect(baselineState(null, [row('0001_people.sql')])).toEqual({ kind: 'none' });
    expect(baselineState(null, [])).toEqual({ kind: 'none' });
  });

  it('is a fresh database with nothing recorded', () => {
    expect(baselineState(baseline, [])).toEqual({ kind: 'fresh' });
  });

  it('is adopted once the baseline is recorded, under its LF or its CRLF checksum, with later rows', () => {
    expect(baselineState(baseline, [baselineRow()])).toEqual({ kind: 'adopted' });
    expect(baselineState(baseline, [baselineRow('crlf'), { version: '0002', filename: '0002_new.sql', checksum: 'x' }])).toEqual({ kind: 'adopted' });
  });

  it('adopts a database with every replaced migration recorded as listed: LF, mixed LF and CRLF, and with rows the baseline does not list, kept and named', () => {
    expect(baselineState(baseline, NAMES.map((f) => row(f)))).toEqual({ kind: 'adopt', extra: [] });
    expect(baselineState(baseline, [row('0001_people.sql', 'crlf'), row('0002_pets.sql'), row('0003_toys.sql', 'crlf')])).toEqual({ kind: 'adopt', extra: [] });
    const branch = [{ version: '0061', filename: '0061_branch.sql', checksum: 'y' }, { version: '0060', filename: '0060_branch.sql', checksum: 'x' }];
    expect(baselineState(baseline, [...NAMES.map((f) => row(f)), ...branch])).toEqual({ kind: 'adopt', extra: ['0060_branch.sql', '0061_branch.sql'] });
  });

  it('refuses a database with only some of them, in the exact words', () => {
    expect(baselineState(baseline, [row('0002_pets.sql'), row('0001_people.sql')])).toEqual({ kind: 'refused', cause: 'partial', reason: PARTIAL });
  });

  it('refuses one that records a replaced migration under another checksum or name, naming it', () => {
    const edited = { ...row('0002_pets.sql'), checksum: 'f'.repeat(64) };
    const reason = (names: string, k = 1) =>
      `Refusing to migrate: this database records ${k} of the migrations 0001_baseline.sql replaces under another name or checksum (${names}). Nothing was changed. ` +
      "They were edited after being applied, so the baseline cannot stand in for this database's schema: bring it to the release tagged pre-baseline and compare it with that release's schema.sql first. " +
      'See docs/guides/upgrading.md, "Across the baseline".';
    expect(baselineState(baseline, [row('0001_people.sql'), edited, row('0003_toys.sql')])).toEqual({ kind: 'refused', cause: 'mismatch', reason: reason('0002_pets.sql') });
    const renamed = { ...row('0003_toys.sql'), filename: '0003_games.sql' };
    expect(baselineState(baseline, [row('0001_people.sql'), edited, renamed])).toEqual({ kind: 'refused', cause: 'mismatch', reason: reason('0002_pets.sql, 0003_toys.sql', 2) });
  });

  it('refuses one whose rows are neither the baseline nor anything it replaces', () => {
    const rows = [{ version: '0002', filename: '0002_other.sql', checksum: 'b' }, { version: '0001', filename: '0001_init.sql', checksum: 'a' }];
    expect(baselineState(baseline, rows)).toEqual({
      kind: 'refused',
      cause: 'foreign',
      reason: 'Refusing to migrate: schema_migrations records 2 migration(s) (0001_init.sql…), but neither 0001_baseline.sql nor any migration it replaces. Nothing was changed. This database was not built by these migrations.',
    });
  });

  it('leaves the baseline’s own row under another checksum to the checksum check, as for any edited file', () => {
    expect(baselineState(baseline, [{ ...baselineRow(), checksum: 'e'.repeat(64) }])).toEqual({ kind: 'adopted' });
  });

  it('words --mark-applied’s refusal on a database migrate would adopt', () => {
    expect(markAppliedRefusal('0001', baseline)).toBe(
      'Refusing to mark 0001 applied: this database has applied every migration 0001_baseline.sql replaces. Run npm run db:migrate, which records 0001_baseline.sql in their place.'
    );
  });
});

describe('whether a dump restores into this checkout', () => {
  const VERSIONS = ['0001', '0004'];

  it('allows a complete dump from before the baseline: the migrate after it adopts', () => {
    expect(restoreVerdict(baseline, VERSIONS, NAMES.map((f) => row(f, 'crlf')))).toEqual({ ok: true, adopts: true });
  });

  it('refuses a partial one before anything is restored, in the exact words', () => {
    expect(restoreVerdict(baseline, VERSIONS, [row('0001_people.sql'), row('0002_pets.sql')])).toEqual({
      ok: false,
      reason:
        'Refusing to restore: the dump predates 0001_baseline.sql and has applied 2 of the 3 migrations it replaces, the last 0002_pets.sql. Nothing was changed. ' +
        "Restore it with the release tagged pre-baseline, whose migrate applies the rest up to 0003_toys.sql; then run this release's migrate, which records 0001_baseline.sql in their place. " +
        'See docs/guides/backup.md, "Restoring a backup from before the baseline".',
    });
  });

  it('refuses a dump that records a replaced migration under another checksum, and one built by other migrations', () => {
    const edited = { ...row('0003_toys.sql'), checksum: 'f'.repeat(64) };
    const mismatch = restoreVerdict(baseline, VERSIONS, [row('0001_people.sql'), row('0002_pets.sql'), edited]);
    expect(mismatch).toMatchObject({ ok: false, reason: expect.stringMatching(/^Refusing to restore: the dump records 1 of the migrations 0001_baseline.sql replaces under another name or checksum \(0003_toys.sql\)/) });
    const foreign = restoreVerdict(baseline, VERSIONS, [{ version: '0001', filename: '0001_init.sql', checksum: 'a' }]);
    expect(foreign).toMatchObject({ ok: false, reason: expect.stringMatching(/^Refusing to restore: the dump's schema_migrations records 1 migration\(s\) \(0001_init.sql…\)/) });
  });

  it('refuses a newer dump, from before the baseline or after it', () => {
    const newer = { version: '0099', filename: '0099_newer.sql', checksum: 'n' };
    const reason = "Refusing to restore: the dump has migration version(s) 0099 not present in this checkout's migrations/. Restoring a newer dump into an older app is not supported — check out the matching app version first.";
    expect(restoreVerdict(baseline, VERSIONS, [...NAMES.map((f) => row(f)), newer])).toEqual({ ok: false, reason });
    expect(restoreVerdict(baseline, VERSIONS, [baselineRow(), newer])).toEqual({ ok: false, reason });
  });

  it('allows a dump from after the baseline, and any dump this checkout has every version of when there is no baseline', () => {
    expect(restoreVerdict(baseline, VERSIONS, [baselineRow(), { version: '0004', filename: '0004_later.sql', checksum: 'l' }])).toEqual({ ok: true, adopts: false });
    expect(restoreVerdict(null, ['0001', '0002', '0003'], NAMES.map((f) => row(f)))).toEqual({ ok: true, adopts: false });
    expect(restoreVerdict(null, ['0001', '0002'], NAMES.map((f) => row(f)))).toMatchObject({ ok: false, reason: expect.stringContaining('migration version(s) 0003 not present') });
  });
});
