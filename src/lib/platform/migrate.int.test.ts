// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db } from './db.server';
import { markApplied, migrationStatus, runMigrations } from './migrate.server';
import { MigrationRefused, migrationChecksums } from './baseline.server';
import { createEmptyDatabase, dropDatabase, urlFor } from '$tests/support/databases';
import { databaseName } from '$tests/e2e/testDb';
import { runScript } from '$tests/integration/scripts';

// The file's clone, and the run's base database it is named after.
const clone = databaseName(process.env.DATABASE_URL!);
const runUrl = urlFor(process.env.DATABASE_URL!, clone.replace(/_int_c\d+_[a-z0-9]+$/, ''));

// Named as a clone is (`<clone>m<n>`), so a crashed run's sweep removes them.
let made = 0;
const databases: string[] = [];
function newDatabaseName(): string {
  const name = `${clone}m${++made}`;
  databases.push(name);
  return name;
}

const folders: string[] = [];
/** A temporary folder holding `files` (name → contents), as migrations/ holds the app's. */
function migrations(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'owlgraph-migrate-'));
  folders.push(dir);
  for (const [name, contents] of Object.entries(files)) writeFileSync(path.join(dir, name), contents);
  return dir;
}

afterAll(async () => {
  for (const name of databases) await dropDatabase(runUrl, name);
  for (const dir of folders) rmSync(dir, { recursive: true, force: true });
});

/** Runs `test` on a new, empty database of its own, through a pool that is closed afterwards. */
async function onEmptyDatabase(test: (sql: postgres.Sql, name: string) => Promise<void>): Promise<void> {
  const name = newDatabaseName();
  const sql = postgres(await createEmptyDatabase(runUrl, name), { onnotice: () => {} });
  try {
    await test(sql, name);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** What schema_migrations records, by version. */
async function recorded(sql: postgres.Sql) {
  return [...(await sql<{ version: string; filename: string; checksum: string }[]>`select version, filename, checksum from schema_migrations order by version`)];
}

async function exists(sql: postgres.Sql, relation: string): Promise<boolean> {
  const [{ present }] = await sql<{ present: boolean }[]>`select to_regclass(${relation}) is not null as present`;
  return present;
}

async function until(condition: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`the condition did not hold within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('a failing migration', () => {
  it('leaves no part of its file applied and no record of it, and the files after it do not run', async () => {
    const dir = migrations({
      '0001_lists.sql': 'create table lists (id int primary key);\ninsert into lists values (1);\n',
      '0002_items.sql': 'create table items (id int primary key);\ninsert into lists values (2);\ninsert into items values (1);\nselect * from no_such_table;\n',
      '0003_after.sql': 'create table after_items (id int primary key);\n',
    });
    await onEmptyDatabase(async (sql) => {
      await expect(runMigrations(sql, dir)).rejects.toThrow(/no_such_table/);
      expect((await recorded(sql)).map((r) => r.filename)).toEqual(['0001_lists.sql']);
      // Neither the table it made nor its row in an earlier file's table.
      expect(await exists(sql, 'items')).toBe(false);
      expect((await sql<{ id: number }[]>`select id from lists order by id`).map((r) => r.id)).toEqual([1]);
      expect(await exists(sql, 'after_items')).toBe(false);

      // Mended, it runs whole, and the file after it too.
      writeFileSync(path.join(dir, '0002_items.sql'), 'create table items (id int primary key);\ninsert into lists values (2);\ninsert into items values (1);\n');
      expect((await runMigrations(sql, dir)).applied).toEqual(['0002_items.sql', '0003_after.sql']);
      expect((await sql<{ id: number }[]>`select id from lists order by id`).map((r) => r.id)).toEqual([1, 2]);
    });
  });
});

describe('a migration with a comment left open', () => {
  // Postgres nests block comments: the /* in docs/*.md opens a second one,
  // which the */ closes, so the first is never closed.
  const OPEN = 'create table items (id int primary key);\n/* fills items from docs/*.md */\ninsert into lists values (2);\n';

  it.each(['0002_items.sql', '0002_items.no-tx.sql'])('is refused by name before any of it runs, and nothing of it is recorded: %s', async (file) => {
    const dir = migrations({
      '0001_lists.sql': 'create table lists (id int primary key);\ninsert into lists values (1);\n',
      [file]: OPEN,
      '0003_after.sql': 'create table after_items (id int primary key);\n',
    });
    await onEmptyDatabase(async (sql) => {
      await expect(runMigrations(sql, dir)).rejects.toThrow(`The /* comment opened on line 2 of migration ${file} is never closed`);
      expect((await recorded(sql)).map((r) => r.filename)).toEqual(['0001_lists.sql']);
      // Not even the statement before the comment, outside a transaction too.
      expect(await exists(sql, 'items')).toBe(false);
      expect((await sql<{ id: number }[]>`select id from lists order by id`).map((r) => r.id)).toEqual([1]);
      expect(await exists(sql, 'after_items')).toBe(false);
    });
  });
});

describe('an applied migration’s checksum', () => {
  const PEOPLE = 'create table people (id int primary key);\n';
  const PETS = 'create table pets (id int primary key);\n';
  const TOYS = 'create table toys (id int primary key);\n';
  const crlf = (text: string) => text.replace(/\n/g, '\r\n');

  /** Two files applied, a third pending — then `test`. */
  async function twoApplied(test: (sql: postgres.Sql, dir: string) => Promise<void>): Promise<void> {
    const dir = migrations({ '0001_people.sql': PEOPLE, '0002_pets.sql': PETS });
    await onEmptyDatabase(async (sql) => {
      expect((await runMigrations(sql, dir)).applied).toEqual(['0001_people.sql', '0002_pets.sql']);
      writeFileSync(path.join(dir, '0003_toys.sql'), TOYS);
      await test(sql, dir);
    });
  }

  it('refuses a run, before any migration executes, when an applied file’s content has changed', async () => {
    await twoApplied(async (sql, dir) => {
      const before = await recorded(sql);
      writeFileSync(path.join(dir, '0001_people.sql'), 'create table people (id int primary key, name text);\n');
      await expect(runMigrations(sql, dir)).rejects.toThrow('Migration 0001_people.sql was modified after being applied');
      expect(await recorded(sql)).toEqual(before);
      expect(await exists(sql, 'toys')).toBe(false);
    });
  });

  it('refuses a run, before any migration executes, when an applied file’s recorded name differs', async () => {
    await twoApplied(async (sql, dir) => {
      const before = await recorded(sql);
      renameSync(path.join(dir, '0002_pets.sql'), path.join(dir, '0002_animals.sql'));
      await expect(runMigrations(sql, dir)).rejects.toThrow('Migration version 0002 is recorded as "0002_pets.sql" but the file on disk is "0002_animals.sql"');
      expect(await recorded(sql)).toEqual(before);
      expect(await exists(sql, 'toys')).toBe(false);
    });
  });

  it('accepts the CRLF checkout of unchanged content, and the LF one against a row a CRLF checkout recorded', async () => {
    await twoApplied(async (sql, dir) => {
      // A Windows checkout: every file CRLF, the pending one too.
      for (const [file, contents] of Object.entries({ '0001_people.sql': PEOPLE, '0002_pets.sql': PETS, '0003_toys.sql': TOYS })) {
        writeFileSync(path.join(dir, file), crlf(contents));
      }
      expect((await runMigrations(sql, dir)).applied).toEqual(['0003_toys.sql']);
      // Recorded by its content, whatever its line endings.
      expect((await recorded(sql)).find((r) => r.version === '0003')?.checksum).toBe(sha256(TOYS));

      // An older row may hold a CRLF checkout's hash; an LF checkout still matches it.
      await sql`update schema_migrations set checksum = ${sha256(crlf(PEOPLE))} where version = '0001'`;
      writeFileSync(path.join(dir, '0001_people.sql'), PEOPLE);
      expect((await runMigrations(sql, dir)).applied).toEqual([]);
    });
  });
});

describe('pending migrations', () => {
  // Each depends on the one before it, and logs that it ran.
  const FILES: Record<string, string> = {
    '0001_log.sql': "create table run_log (n int generated always as identity, file text not null);\ninsert into run_log (file) values ('0001_log.sql');\n",
    '0002_note.sql': "alter table run_log add column note text;\ninsert into run_log (file, note) values ('0002_note.sql', 'after 0001');\n",
    '0010_last.sql': "insert into run_log (file, note) values ('0010_last.sql', 'after 0002');\n",
  };
  const NAMES = Object.keys(FILES);

  it('apply in file order, each recorded once with its checksum, and a second run applies nothing again', async () => {
    // Written last first: the order is the files' names, not the order they were made in.
    const dir = migrations(Object.fromEntries(Object.entries(FILES).reverse()));
    await onEmptyDatabase(async (sql) => {
      const ran = async () => (await sql<{ file: string }[]>`select file from run_log order by n`).map((r) => r.file);
      const appliedAt = async () => [...(await sql`select version, applied_at from schema_migrations order by version`)];

      expect((await runMigrations(sql, dir)).applied).toEqual(NAMES);
      expect(await ran()).toEqual(NAMES);
      expect(await recorded(sql)).toEqual(NAMES.map((filename) => ({ version: filename.slice(0, 4), filename, checksum: sha256(FILES[filename]) })));
      const first = await appliedAt();

      expect((await runMigrations(sql, dir)).applied).toEqual([]);
      expect(await ran()).toEqual(NAMES);
      expect(await appliedAt()).toEqual(first);
    });
  });

  it('apply in the order of their numbers, a longer one after a shorter: 10000 after 9999', async () => {
    const dir = migrations({
      '9999_log.sql': "create table run_log (n int generated always as identity, file text not null);\ninsert into run_log (file) values ('9999_log.sql');\n",
      '10000_after.sql': "insert into run_log (file) values ('10000_after.sql');\n",
    });
    await onEmptyDatabase(async (sql) => {
      expect((await runMigrations(sql, dir)).applied).toEqual(['9999_log.sql', '10000_after.sql']);
      expect((await sql<{ file: string }[]>`select file from run_log order by n`).map((r) => r.file)).toEqual(['9999_log.sql', '10000_after.sql']);
    });
  });

  it('refuses two files of one version, written with and without its leading zeros', async () => {
    const dir = migrations({ '0010_one.sql': 'select 1;\n', '10_two.sql': 'select 2;\n' });
    await onEmptyDatabase(async (sql) => {
      await expect(runMigrations(sql, dir)).rejects.toThrow(/Duplicate migration version/);
      expect(await exists(sql, 'schema_migrations')).toBe(false);
    });
  });

  it('apply once when two runs start at once on two connections — the second waits on the lock, then finds nothing to do', async () => {
    const dir = migrations({
      '0001_slow.sql': "create table run_log (file text not null, pid int not null default pg_backend_pid());\ninsert into run_log (file) values ('0001_slow.sql');\nselect pg_sleep(2);\n",
      '0002_next.sql': "insert into run_log (file) values ('0002_next.sql');\n",
    });
    await onEmptyDatabase(async (sql, name) => {
      const url = urlFor(runUrl, name);
      const [one, two] = [postgres(url, { onnotice: () => {} }), postgres(url, { onnotice: () => {} })];
      try {
        const firstRun = runMigrations(one, dir);
        firstRun.catch(() => {}); // awaited below; not an unhandled rejection while the second is started
        // The second starts while the first is inside its slow file, holding the lock.
        await until(async () => {
          const [{ n }] = await sql<{ n: number }[]>`
            select count(*)::int as n from pg_stat_activity
            where datname = ${name} and pid <> pg_backend_pid() and state = 'active' and query like '%pg_sleep%'`;
          return n > 0;
        });
        const secondRun = runMigrations(two, dir);
        const [first, second] = await Promise.all([firstRun, secondRun]);

        expect(first.applied).toEqual(['0001_slow.sql', '0002_next.sql']);
        expect(second.applied).toEqual([]);
        const log = await sql<{ file: string; pid: number }[]>`select file, pid from run_log order by file`;
        expect(log.map((r) => r.file)).toEqual(['0001_slow.sql', '0002_next.sql']);
        expect(new Set(log.map((r) => r.pid)).size).toBe(1);
        expect((await recorded(sql)).map((r) => r.version)).toEqual(['0001', '0002']);
      } finally {
        await Promise.all([one.end({ timeout: 5 }), two.end({ timeout: 5 })]);
      }
    });
  });
});

describe('the migration status', () => {
  it('counts the applied migrations, names the one of the highest number the latest — 10000 after 9999 — and lists the pending ones by number', async () => {
    const dir = migrations({ '9999_log.sql': 'create table run_log (file text not null);\n', '10000_after.sql': "insert into run_log (file) values ('10000_after.sql');\n" });
    await onEmptyDatabase(async (sql) => {
      await runMigrations(sql, dir);
      writeFileSync(path.join(dir, '10001_next.sql'), 'select 1;\n');
      writeFileSync(path.join(dir, '100000_much_later.sql'), 'select 2;\n');
      expect(await migrationStatus(sql, dir)).toEqual({
        applied: 2,
        latest: '10000_after.sql',
        pending: ['10001_next.sql', '100000_much_later.sql'],
        adopts: null,
        refused: null,
      });
    });
  });
});

describe('a baseline', () => {
  // "old" is three migrations; "new" a baseline whose header lists them, and a
  // file after it. The baseline's body logs that it ran.
  const OLD: Record<string, string> = {
    '0001_a.sql': 'create table run_log (note text not null);\ncreate table a (id int primary key);\n',
    '0002_b.sql': 'create table b (id int primary key);\n',
    '0003_c.sql': 'create table c (id int primary key);\n',
  };
  const BASELINE =
    '-- The baseline.\n--\n-- upgrade-through: pre-baseline\n' +
    Object.keys(OLD).map((f) => `-- replaces: ${f.slice(0, 4)} ${f} ${migrationChecksums(OLD[f]).join(' ')}\n`).join('') +
    '\ncreate table run_log (note text not null);\ncreate table a (id int primary key);\ncreate table b (id int primary key);\ncreate table c (id int primary key);\n' +
    "insert into run_log (note) values ('baseline ran');\n";
  const LATER = "create table d (id int primary key);\ninsert into run_log (note) values ('0004 ran');\n";
  const NEW = { '0001_baseline.sql': BASELINE, '0004_d.sql': LATER };
  const ADOPTED = { baseline: '0001_baseline.sql', replaced: 3 };
  const AFTER = [
    { version: '0001', filename: '0001_baseline.sql', checksum: sha256(BASELINE) },
    { version: '0004', filename: '0004_d.sql', checksum: sha256(LATER) },
  ];
  const PARTIAL =
    'Refusing to migrate: this database predates 0001_baseline.sql and has applied 2 of the 3 migrations it replaces, the last 0002_b.sql. Nothing was changed. ' +
    'Upgrade it in two steps, with a backup before each: first with the release tagged pre-baseline, whose migrate applies the rest up to 0003_c.sql; ' +
    'then with this release, whose migrate records 0001_baseline.sql in their place. See docs/guides/upgrading.md, "Across the baseline".';

  const notes = async (sql: postgres.Sql) => (await sql<{ note: string }[]>`select note from run_log order by note`).map((r) => r.note);

  /** A database the first `count` of "old" built, then `test`. */
  async function atOld(test: (sql: postgres.Sql) => Promise<void>, count = 3): Promise<void> {
    await onEmptyDatabase(async (sql) => {
      expect((await runMigrations(sql, migrations(Object.fromEntries(Object.entries(OLD).slice(0, count))))).adopted).toBeNull();
      await test(sql);
    });
  }

  it('runs on a fresh database like any file, then the files after it', async () => {
    await onEmptyDatabase(async (sql) => {
      expect(await runMigrations(sql, migrations(NEW))).toEqual({ applied: ['0001_baseline.sql', '0004_d.sql'], adopted: null });
      expect(await recorded(sql)).toEqual(AFTER);
      expect(await notes(sql)).toEqual(['0004 ran', 'baseline ran']);
    });
  });

  it('is recorded in place of what it replaces on a database that has applied all of it, without running, and the files after it run', async () => {
    await atOld(async (sql) => {
      const dir = migrations(NEW);
      expect(await runMigrations(sql, dir)).toEqual({ applied: ['0004_d.sql'], adopted: ADOPTED });
      expect(await notes(sql)).toEqual(['0004 ran']);
      expect(await recorded(sql)).toEqual(AFTER);

      expect(await runMigrations(sql, dir)).toEqual({ applied: [], adopted: null });
      expect(await recorded(sql)).toEqual(AFTER);
    });
  });

  it('is recorded in place of rows a CRLF checkout recorded', async () => {
    await atOld(async (sql) => {
      for (const [file, contents] of Object.entries(OLD)) {
        await sql`update schema_migrations set checksum = ${migrationChecksums(contents)[1]} where filename = ${file}`;
      }
      expect(await runMigrations(sql, migrations(NEW))).toEqual({ applied: ['0004_d.sql'], adopted: ADOPTED });
      expect(await recorded(sql)).toEqual(AFTER);
    });
  });

  it('refuses a database that has applied only some of what it replaces, in the exact words, changing nothing', async () => {
    await atOld(async (sql) => {
      const before = await recorded(sql);
      const run = runMigrations(sql, migrations(NEW));
      await expect(run).rejects.toThrow(PARTIAL);
      await expect(run).rejects.toBeInstanceOf(MigrationRefused);
      expect(await recorded(sql)).toEqual(before);
      expect(await exists(sql, 'c')).toBe(false);
      expect(await exists(sql, 'd')).toBe(false);
      expect(await notes(sql)).toEqual([]);
    }, 2);
  });

  it('refuses a database that records what it replaces under another checksum or name, changing nothing', async () => {
    await atOld(async (sql) => {
      const dir = migrations(NEW);
      await sql`update schema_migrations set checksum = ${'f'.repeat(64)} where version = '0002'`;
      let before = await recorded(sql);
      const mismatch = 'Refusing to migrate: this database records 1 of the migrations 0001_baseline.sql replaces under another name or checksum (0002_b.sql). Nothing was changed.';
      await expect(runMigrations(sql, dir)).rejects.toThrow(mismatch);
      expect(await recorded(sql)).toEqual(before);

      await sql`update schema_migrations set checksum = ${sha256(OLD['0002_b.sql'])}, filename = '0002_bee.sql' where version = '0002'`;
      before = await recorded(sql);
      await expect(runMigrations(sql, dir)).rejects.toThrow(mismatch);
      expect(await recorded(sql)).toEqual(before);
      expect(await exists(sql, 'd')).toBe(false);
    });
  });

  it('lets a later file take a number the baseline replaced, on an adopted database and a fresh one', async () => {
    const REUSED = "create table e (id int primary key);\ninsert into run_log (note) values ('0002 ran');\n";
    const dir = migrations({ ...NEW, '0002_e.sql': REUSED });
    await atOld(async (sql) => {
      expect(await runMigrations(sql, dir)).toEqual({ applied: ['0002_e.sql', '0004_d.sql'], adopted: ADOPTED });
      expect((await recorded(sql)).map((r) => r.filename)).toEqual(['0001_baseline.sql', '0002_e.sql', '0004_d.sql']);
      expect(await notes(sql)).toEqual(['0002 ran', '0004 ran']);
    });
    await onEmptyDatabase(async (sql) => {
      expect((await runMigrations(sql, dir)).applied).toEqual(['0001_baseline.sql', '0002_e.sql', '0004_d.sql']);
    });
  });

  it('is in the migration status: what the next run adopts, a refusal, and an adopted database', async () => {
    const dir = migrations(NEW);
    await atOld(async (sql) => {
      expect(await migrationStatus(sql, dir)).toEqual({ applied: 3, latest: '0003_c.sql', pending: ['0001_baseline.sql', '0004_d.sql'], adopts: ADOPTED, refused: null });
      await runMigrations(sql, dir);
      expect(await migrationStatus(sql, dir)).toEqual({ applied: 2, latest: '0004_d.sql', pending: [], adopts: null, refused: null });
    });
    await atOld(async (sql) => {
      expect(await migrationStatus(sql, dir)).toEqual({
        applied: 2,
        latest: '0002_b.sql',
        pending: [],
        adopts: null,
        refused: { cause: 'partial', baseline: '0001_baseline.sql', tag: 'pre-baseline' },
      });
    }, 2);
  });

  it('makes --mark-applied refuse a database that has applied all of it, recording nothing', async () => {
    await atOld(async (sql) => {
      const before = await recorded(sql);
      await expect(markApplied(sql, '0004', migrations(NEW))).rejects.toThrow(
        'Refusing to mark 0004 applied: this database has applied every migration 0001_baseline.sql replaces. Run npm run db:migrate, which records 0001_baseline.sql in their place.'
      );
      expect(await recorded(sql)).toEqual(before);
    });
  });
});

describe('a .no-tx migration', () => {
  const ITEMS = 'create table items (id int primary key, label text);\n';
  const INDEX = 'create index concurrently items_label_idx on items (label);\n';

  it('runs outside a transaction, so CREATE INDEX CONCURRENTLY succeeds, and is recorded', async () => {
    const dir = migrations({ '0001_items.sql': ITEMS, '0002_items_label_idx.no-tx.sql': INDEX });
    await onEmptyDatabase(async (sql) => {
      expect((await runMigrations(sql, dir)).applied).toEqual(['0001_items.sql', '0002_items_label_idx.no-tx.sql']);
      const index = await sql<{ valid: boolean }[]>`select indisvalid as valid from pg_index where indexrelid = to_regclass('items_label_idx')`;
      expect(index.map((r) => r.valid)).toEqual([true]);
      expect(await recorded(sql)).toContainEqual({ version: '0002', filename: '0002_items_label_idx.no-tx.sql', checksum: sha256(INDEX) });
    });
  });

  it('is what lets it run: in an ordinary file the same statement is refused inside the file’s transaction, and is not recorded', async () => {
    const dir = migrations({ '0001_items.sql': ITEMS, '0002_items_label_idx.sql': INDEX });
    await onEmptyDatabase(async (sql) => {
      await expect(runMigrations(sql, dir)).rejects.toThrow(/cannot run inside a transaction block/);
      expect((await recorded(sql)).map((r) => r.filename)).toEqual(['0001_items.sql']);
      expect(await exists(sql, 'items_label_idx')).toBe(false);
    });
  });
});

describe('migrate in production', () => {
  // scripts/migrate.ts checks four secrets, and the integration project sets
  // two of them itself, so every run here sets or removes all four.
  const STRONG = 'a-long-unguessable-passphrase-7Q';
  const KEY = randomBytes(32).toString('base64');
  const withPassword = (url: string, password: string) => {
    const u = new URL(url);
    u.password = password;
    return u.toString();
  };
  const NAMES = {
    appDbPassword: 'APP_DB_PASSWORD ',
    superuser: 'The Postgres superuser password ',
    secretKey: 'APP_SECRET_KEY ',
    loopback: 'INTEGRATIONS_ALLOW_HTTP_LOOPBACK ',
  };
  const REFUSAL = 'Refusing to migrate in production';

  it('refuses to run and names each weak secret, before touching the database', async () => {
    const name = newDatabaseName();
    const url = await createEmptyDatabase(runUrl, name);
    const run = await runScript('migrate.ts', [], {
      NODE_ENV: 'production',
      // A placeholder, yet the test server's actual superuser password: a run
      // past the check would migrate this database.
      DATABASE_URL: withPassword(url, 'password'),
      // Unset, so a run past the check leaves app_user's password alone.
      APP_DB_PASSWORD: undefined,
      APP_SECRET_KEY: 'not-a-key',
      INTEGRATIONS_ALLOW_HTTP_LOOPBACK: '1',
    });

    expect(run.code).toBe(1);
    expect(run.stderr).toContain('APP_DB_PASSWORD is not set.');
    expect(run.stderr).toContain("The Postgres superuser password (POSTGRES_PASSWORD, in migrate's DATABASE_URL) is still a placeholder value.");
    expect(run.stderr).toContain('APP_SECRET_KEY is shorter than 16 characters.');
    expect(run.stderr).toContain('INTEGRATIONS_ALLOW_HTTP_LOOPBACK is test tooling and must not be set.');
    expect(run.stderr).toContain(REFUSAL);
    expect(run.stdout).not.toMatch(/Applied|Already up to date|app_user password/);

    const target = postgres(url, { max: 1, onnotice: () => {} });
    try {
      expect(await exists(target, 'public.schema_migrations')).toBe(false);
      expect(await target`select tablename from pg_tables where schemaname = 'public'`).toHaveLength(0);
    } finally {
      await target.end({ timeout: 5 });
    }
  });

  // The others strong; the superuser's is then wrong, but the run must refuse
  // before it connects.
  it.each([
    { weak: 'appDbPassword' as const, env: { APP_DB_PASSWORD: 'changeme' }, line: 'APP_DB_PASSWORD is still a placeholder value.' },
    { weak: 'superuser' as const, password: 'short', line: "The Postgres superuser password (POSTGRES_PASSWORD, in migrate's DATABASE_URL) is shorter than 16 characters." },
    { weak: 'secretKey' as const, env: { APP_SECRET_KEY: Buffer.alloc(32, 7).toString('base64') }, line: 'APP_SECRET_KEY is not random.' },
    { weak: 'loopback' as const, env: { INTEGRATIONS_ALLOW_HTTP_LOOPBACK: '1' }, line: 'INTEGRATIONS_ALLOW_HTTP_LOOPBACK is test tooling and must not be set.' },
  ])('refuses for $weak alone, naming only it', async ({ weak, env, password, line }) => {
    const name = newDatabaseName(); // never created: a run that got past the check would create it
    const run = await runScript('migrate.ts', [], {
      NODE_ENV: 'production',
      DATABASE_URL: withPassword(urlFor(runUrl, name), password ?? STRONG),
      APP_DB_PASSWORD: STRONG,
      APP_SECRET_KEY: KEY,
      INTEGRATIONS_ALLOW_HTTP_LOOPBACK: undefined,
      ...env,
    });

    expect(run.code).toBe(1);
    expect(run.stderr).toContain(line);
    for (const [secret, prefix] of Object.entries(NAMES)) if (secret !== weak) expect(run.stderr).not.toContain(prefix);
    expect(run.stderr).toContain(REFUSAL);
    expect(await db`select 1 from pg_database where datname = ${name}`).toHaveLength(0);
  });
});
