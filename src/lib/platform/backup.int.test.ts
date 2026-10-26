// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { db } from '$lib/platform/db.server';
import { readBaseline, type MigrationRow, type ReplacedMigration } from '$lib/platform/baseline.server';
import { runMigrations } from '$lib/platform/migrate.server';
import { secretBox } from '$lib/platform/secretBox.server';
import { addCuratedMember, createCollection } from '$lib/features/collections/server';
import { createDocument, createLinkDocument, replaceDocumentBytes } from '$lib/features/documents/server';
import { sealCredential, storeConnection, storeSealedSecret } from '$lib/features/pluginHost/server';
import { baseName, createEmptyDatabase, dropDatabase, urlFor } from '$tests/support/databases';
import { pgContainer } from '$tests/integration/pg';
import { runScript } from '$tests/integration/scripts';
import { userOf } from '$tests/integration/users';

// The scripts run as an operator runs them, against the server in its container
// (docs/guides/backup.md). A restore may overwrite only `<clone>_target`, which this
// file makes.

const pg = pgContainer();
const fileUrl = process.env.DATABASE_URL!;
const clone = baseName(fileUrl);
// The run's base database, from the clone's name (`<base>_int_c<pid>_<id>`).
const runUrl = urlFor(fileUrl, clone.replace(/_int_c\d+_[a-z0-9]+$/, ''));
const scratch = `${clone}_rt`;
const target = `${clone}_target`;
const PLUGIN = 'some-service';
const ORIGIN = 'https://service.example';

// No POSTGRES_DB: without --db the scripts refuse rather than fall back to the
// container's own database.
const env = { DATABASE_URL: fileUrl, PG_CONTAINER: pg.skipped ? undefined : pg.name, POSTGRES_DB: undefined };

const admin = postgres(urlFor(fileUrl, 'postgres'), { max: 1, onnotice: () => {} });
const exists = async (name: string) => (await admin`select 1 from pg_database where datname = ${name}`).length > 0;

let dir = '';
let dumps = 0;
/** Dumps `database` to a new file in `dir`. */
async function backup(database = clone) {
  const file = path.join(dir, `backup-${++dumps}.dump`);
  const run = await runScript('backup.ts', [`--out=${file}`, `--db=${database}`], env);
  expect(run.code, run.stdout + run.stderr).toBe(0);
  expect(run.stdout).toContain(`Backup written to ${file}`);
  return file;
}

const restoreTest = (file: string) => runScript('restore-test.ts', [`--file=${file}`, `--db=${clone}`], env);

/** The checks a restore-test run printed, by outcome: label → detail. */
function checks(stdout: string) {
  const out = { PASS: new Map<string, string>(), FAIL: new Map<string, string>(), SKIP: [] as string[] };
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^(PASS|FAIL|SKIP) {2}(.*?)(?: — (.*))?$/.exec(line);
    if (!m) continue;
    if (m[1] === 'SKIP') out.SKIP.push(m[2]);
    else out[m[1] as 'PASS' | 'FAIL'].set(m[2], m[3] ?? '');
  }
  return out;
}

const count = async (query: string, sql: postgres.Sql = db) => String((await sql.unsafe(query))[0].count);
/** The upload whose bytes the restore test compares: the first by id. */
const comparedDocument = async () => (await db<{ id: string }[]>`select id from documents where source = 'upload' order by id limit 1`)[0].id;

let curatedId = '';
let mirroredId = '';

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'owlgraph-backup-'));
});
afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  await admin.end({ timeout: 5 });
});

describe.skipIf(pg.skipped)('a backup restored by the restore test', () => {
  beforeAll(async () => {
    const user = await userOf('admin');
    const upload = await createDocument({ bytes: Buffer.from('Backed up byte for byte.\n'), mime: 'text/plain', filename: 'backup.txt', createdBy: user.id, user });
    const link = await createLinkDocument({ url: 'https://example.org/backed-up', title: 'Backed-up link', createdBy: user.id, user });
    curatedId = (await createCollection({ title: 'Backed-up collection', createdBy: user.id, user })).id;
    await addCuratedMember(curatedId, upload.id, user);
    await addCuratedMember(curatedId, link.id, user);
    mirroredId = (await createCollection({ title: 'Backed-up share', createdBy: user.id, user, plugin: PLUGIN, sourceRef: { path: '/share' } })).id;
    await storeSealedSecret(db, mirroredId, PLUGIN, secretBox().seal('node-source-secret', 'share-token'));
    const binding = { userId: user.id, plugin: PLUGIN, origin: ORIGIN };
    const sealed = sealCredential(binding, { kind: 'app_password', login: user.email, secret: 'app-password' });
    await storeConnection(db, { ...binding, kind: 'app_password', sealed: sealed!, accountId: user.email, accountLabel: user.name });
  });

  it('has the live database’s schema, migrations, collections, sealed credentials and document bytes — and the scratch database is dropped afterwards', async () => {
    const file = await backup();
    const run = await restoreTest(file);
    expect(run.code, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toContain('All checks passed.');

    const { PASS, FAIL, SKIP } = checks(run.stdout);
    expect(FAIL).toEqual(new Map());
    expect(SKIP).toEqual([]);
    expect([...PASS.keys()]).toEqual(
      expect.arrayContaining([
        "dump migrations aren't newer than this checkout",
        'schema restored (public tables present)',
        'schema_migrations has rows',
        'pgcrypto extension present',
        'pages.search_tsv computes',
        'documents.search_tsv computes',
        'collections.search_tsv computes',
        'collections and their members round-trip',
        'sealed credentials round-trip',
        'connections round-trip',
        'document byte round-trip',
      ])
    );
    expect(PASS.get('schema restored (public tables present)')).toBe(`${await count("select count(*) from information_schema.tables where table_schema = 'public'")} tables`);
    expect(PASS.get('schema_migrations has rows')).toBe(`${await count('select count(*) from schema_migrations')} rows`);
    const members = await count("select count(*) from edges where relationship_type = 'contains'");
    expect(Number(members)).toBeGreaterThanOrEqual(2);
    expect(PASS.get('collections and their members round-trip')).toBe(`collections:contains ${await count('select count(*) from collections')}:${members}`);
    expect(PASS.get('sealed credentials round-trip')).toBe('1 credential(s)');
    expect(PASS.get('connections round-trip')).toBe('1 connection(s)');
    expect(PASS.get('document byte round-trip')).toBe(`document ${await comparedDocument()}`);

    expect(await exists(scratch)).toBe(false);
  }, 180_000);

  it('fails, naming each check, when the live database no longer holds what the backup does — and still drops the scratch database', async () => {
    const file = await backup();
    // Changed after the backup, as a dump that lost them would compare.
    const user = await userOf('admin');
    const late = await createLinkDocument({ url: 'https://example.org/late', title: 'Late member', createdBy: user.id, user });
    await addCuratedMember(curatedId, late.id, user);
    await storeSealedSecret(db, mirroredId, PLUGIN, secretBox().seal('node-source-secret', 'another-share-token'));
    const binding = { userId: user.id, plugin: PLUGIN, origin: ORIGIN };
    const sealed = sealCredential(binding, { kind: 'app_password', login: user.email, secret: 'another-app-password' });
    await storeConnection(db, { ...binding, kind: 'app_password', sealed: sealed!, accountId: user.email, accountLabel: user.name });
    await replaceDocumentBytes(await comparedDocument(), { bytes: Buffer.from('Changed after the backup.\n'), mime: 'text/plain', filename: 'changed.txt' });

    const run = await restoreTest(file);
    expect(run.code, run.stdout + run.stderr).toBe(1);
    const failed = ['collections and their members round-trip', 'sealed credentials round-trip', 'connections round-trip', 'document byte round-trip'];
    expect([...checks(run.stdout).FAIL.keys()]).toEqual(failed);
    expect(run.stderr).toContain(`${failed.length} check(s) failed: ${failed.join(', ')}`);
    expect(run.stdout).not.toContain('All checks passed.');

    expect(await exists(scratch)).toBe(false);
  }, 180_000);

  it('refuses a --db whose scratch database’s name Postgres would cut back to that database, before dropping or making anything', async () => {
    // 63 bytes, never made: `<name>_rt` cut to 63 bytes is this name itself.
    const long = `${clone}_`.padEnd(63, 'x');
    const run = await runScript('restore-test.ts', ['--file=never-read.dump', `--db=${long}`], env);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain(`Refusing to use identifier longer than 63 bytes, which Postgres would cut short to another name: "${long}_rt"`);
    expect(run.stdout).not.toContain('Dropping/recreating');
    expect(await exists(long)).toBe(false);
  }, 60_000);
});

describe.skipIf(pg.skipped)('restore', () => {
  let dump = '';
  let newer = '';
  // Dumps from before the baseline: one that applied the first 41 of the
  // migrations it replaces, and one that applied every one.
  let partial = '';
  let complete = '';
  const baselineFile = path.resolve(import.meta.dirname, '..', '..', '..', 'migrations', '0001_baseline.sql');
  const baseline = readBaseline([{ version: '0001', filename: '0001_baseline.sql', contents: readFileSync(baselineFile, 'utf8') }])!;
  const replacedRows = (entries: ReplacedMigration[]): MigrationRow[] => entries.map((r) => ({ version: r.version, filename: r.filename, checksum: r.checksums[0] }));
  const SOME = 41;

  /** A dump of this file's database as one that records `rows` in schema_migrations would be. */
  async function backupRecording(rows: MigrationRow[]) {
    const own = await db<(MigrationRow & { applied_at: Date })[]>`select version, filename, checksum, applied_at from schema_migrations`;
    const record = (recorded: readonly object[]) =>
      db.begin(async (sql) => {
        await sql`delete from schema_migrations`;
        await sql`insert into schema_migrations ${sql(recorded as Record<string, unknown>[])}`;
      });
    await record(rows);
    try {
      return await backup();
    } finally {
      await record(own);
    }
  }

  /** The target's tables and marker notes. */
  async function targetState() {
    const sql = postgres(urlFor(fileUrl, target), { max: 1, onnotice: () => {} });
    try {
      const tables = (await sql<{ name: string }[]>`select table_name as name from information_schema.tables where table_schema = 'public' order by 1`).map((t) => t.name);
      const notes = tables.includes('restore_marker') ? (await sql<{ note: string }[]>`select note from restore_marker`).map((r) => r.note) : [];
      return { tables, notes };
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
  const untouched = { tables: ['restore_marker'], notes: ['as this file made it'] };
  const restore = (args: string[]) => runScript('restore.ts', args, env);

  beforeAll(async () => {
    const sql = postgres(await createEmptyDatabase(runUrl, target), { max: 1, onnotice: () => {} });
    try {
      await sql`create table restore_marker (note text not null)`;
      await sql`insert into restore_marker (note) values ('as this file made it')`;
    } finally {
      await sql.end({ timeout: 5 });
    }
    dump = await backup();
    // A dump from a newer checkout: it records a version this one lacks.
    await db`insert into schema_migrations (version, filename, checksum) values ('9999', '9999_from_a_newer_checkout.sql', 'not-a-checksum')`;
    try {
      newer = await backup();
    } finally {
      await db`delete from schema_migrations where version = '9999'`;
    }
    partial = await backupRecording(replacedRows(baseline.replaces.slice(0, SOME)));
    complete = await backupRecording(replacedRows(baseline.replaces));
  }, 180_000);
  afterAll(async () => {
    await dropDatabase(runUrl, target);
  });

  it('refuses without --yes, before reading the dump, leaving the target as it was', async () => {
    const run = await restore([`--file=${dump}`, `--db=${target}`]);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain(`About to restore "${dump}" into database "${target}"`);
    expect(run.stderr).toContain('Refusing to proceed without --yes.');
    expect(run.stdout).not.toContain('Checking the dump');
    expect(await targetState()).toEqual(untouched);
  }, 60_000);

  it('refuses an unsafe --db name before anything else, leaving the target as it was', async () => {
    for (const name of [`${target};echo injected`, `${target} --clean`, `"${target}"`]) {
      const run = await restore([`--file=${dump}`, `--db=${name}`, '--yes']);
      expect(run.code, name).toBe(1);
      expect(run.stderr, name).toContain(`Refusing to use unsafe-looking identifier: "${name}"`);
      expect(run.stdout, name).not.toContain('About to restore');
    }
    expect(await targetState()).toEqual(untouched);
  }, 60_000);

  it('refuses a dump recording a migration this checkout does not have, leaving the target as it was', async () => {
    const run = await restore([`--file=${newer}`, `--db=${target}`, '--yes']);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("Refusing to restore: the dump has migration version(s) 9999 not present in this checkout's migrations/.");
    expect(run.stdout).not.toContain('Restored into');
    expect(await targetState()).toEqual(untouched);
  }, 60_000);

  it('refuses a dump from before the baseline that applied only some of the migrations it replaces, naming the tag to restore it through, leaving the target as it was', async () => {
    const run = await restore([`--file=${partial}`, `--db=${target}`, '--yes']);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain(
      `Refusing to restore: the dump predates 0001_baseline.sql and has applied ${SOME} of the ${baseline.replaces.length} migrations it replaces, the last ${baseline.replaces[SOME - 1].filename}. Nothing was changed. ` +
        `Restore it with the release tagged ${baseline.upgradeThrough}, whose migrate applies the rest up to ${baseline.replaces.at(-1)!.filename}; ` +
        `then run this release's migrate, which records 0001_baseline.sql in their place. See docs/guides/backup.md, "Restoring a backup from before the baseline".`
    );
    expect(run.stdout).not.toContain('Restored into');
    expect(await targetState()).toEqual(untouched);
  }, 60_000);

  it('restores a dump of this checkout into the target once nothing stands in the way — what each refusal kept from happening', async () => {
    const run = await restore([`--file=${dump}`, `--db=${target}`, '--yes']);
    expect(run.code, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toContain(`Restored into "${target}".`);
    expect(run.stdout).toContain(`Skipping migrate (target "${target}" is not the primary database`);

    const { tables } = await targetState();
    expect(tables).toEqual(expect.arrayContaining(['schema_migrations', 'pages', 'documents', 'collections', 'node_source_secrets']));
    const sql = postgres(urlFor(fileUrl, target), { max: 1, onnotice: () => {} });
    try {
      expect(await count('select count(*) from schema_migrations', sql)).toBe(await count('select count(*) from schema_migrations'));
      expect(await count('select count(*) from collections', sql)).toBe(await count('select count(*) from collections'));
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 120_000);

  it('restores a dump from before the baseline that applied every migration it replaces, and migrate then records the baseline in their place', async () => {
    const run = await restore([`--file=${complete}`, `--db=${target}`, '--yes']);
    expect(run.code, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toContain(`Restored into "${target}".`);

    const sql = postgres(urlFor(fileUrl, target), { max: 1, onnotice: () => {} });
    try {
      expect(Number(await count('select count(*) from schema_migrations', sql))).toBe(baseline.replaces.length);
      expect(await runMigrations(sql)).toEqual({ applied: [], adopted: { baseline: '0001_baseline.sql', replaced: baseline.replaces.length } });
      expect(await sql<MigrationRow[]>`select version, filename, checksum from schema_migrations`).toEqual([
        { version: '0001', filename: '0001_baseline.sql', checksum: baseline.checksums[0] },
      ]);
      expect(await runMigrations(sql)).toEqual({ applied: [], adopted: null });
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 120_000);
});
