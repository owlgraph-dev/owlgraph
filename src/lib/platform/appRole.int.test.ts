// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db } from './db.server';
import { runMigrations } from './migrate.server';
import { createEmptyDatabase, dropDatabase, urlFor } from '$tests/support/databases';

// app_user (the role block of migrations/0001_baseline.sql) is what a
// deployment connects as, and every other test connects as the superuser, so
// a missing grant would fail only in production. SET SESSION AUTHORIZATION
// needs no password for it.

const MIGRATIONS = path.resolve(import.meta.dirname, '..', '..', '..', 'migrations');
const LATER = '9999_later_things.sql';

let dir: string;
let app: postgres.ReservedSql;

beforeAll(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'owlgraph-app-role-'));
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) copyFileSync(path.join(MIGRATIONS, file), path.join(dir, file));
  writeFileSync(
    path.join(dir, LATER),
    'create table later_things (id uuid primary key default gen_random_uuid(), label text not null);\n' +
      // A serial column's default calls nextval(), which needs usage of the
      // sequence (the baseline's default privileges on sequences).
      'create table later_counts (n serial primary key, label text not null);\n'
  );
  // The app's own files are applied already: only the later one runs.
  expect((await runMigrations(db, dir)).applied).toEqual([LATER]);

  app = await db.reserve();
  await app`set session authorization app_user`;
  const [who] = await app<{ current: string; session: string }[]>`select current_user as current, session_user as session`;
  expect(who).toEqual({ current: 'app_user', session: 'app_user' });
});

afterAll(async () => {
  if (app) {
    await app`reset session authorization`;
    app.release();
  }
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** Every table in the database, with the columns a write may name (a generated one may not). */
async function tables() {
  return db<{ schema: string; table: string; columns: string[] }[]>`
    select c.table_schema::text as schema, c.table_name::text as table,
           array_agg(c.column_name::text order by c.ordinal_position) as columns
    from information_schema.columns c
    join pg_tables t on t.schemaname = c.table_schema and t.tablename = c.table_name
    where c.table_schema not in ('pg_catalog', 'information_schema') and c.is_generated = 'NEVER'
    group by c.table_schema, c.table_name
    order by c.table_name`;
}

describe('the app’s role, app_user', () => {
  it('reads and writes every table, the one a later migration added included', async () => {
    const all = await tables();
    expect(new Set(all.map((t) => t.schema))).toEqual(new Set(['public']));
    expect(all.map((t) => t.table)).toEqual(expect.arrayContaining(['users', 'nodes', 'pages', 'documents', 'schema_migrations', 'later_things']));

    // Nothing changes (`where false`), but each statement passes the privilege
    // check for what it does on its table.
    const refused: string[] = [];
    for (const { table, columns } of all) {
      const attempts: [string, () => Promise<unknown>][] = [
        ['select', () => app`select 1 from ${app(table)} limit 1`],
        ['insert', () => app`insert into ${app(table)} (${app(columns)}) select ${app(columns)} from ${app(table)} where false`],
        ['update', () => app`update ${app(table)} set ${app(columns[0])} = ${app(columns[0])} where false`],
        ['delete', () => app`delete from ${app(table)} where false`],
      ];
      for (const [verb, attempt] of attempts) {
        try {
          await attempt();
        } catch (e) {
          refused.push(`${verb} ${table}: ${(e as Error).message}`);
        }
      }
    }
    expect(refused).toEqual([]);
  });

  it('stores, changes and removes a row of the later migration’s table', async () => {
    const [{ id }] = await app<{ id: string }[]>`insert into later_things (label) values ('first') returning id`;
    await app`update later_things set label = 'renamed' where id = ${id}`;
    expect((await app<{ label: string }[]>`select label from later_things where id = ${id}`).map((r) => r.label)).toEqual(['renamed']);
    await app`delete from later_things where id = ${id}`;
    expect(await app`select 1 from later_things where id = ${id}`).toHaveLength(0);
  });

  it('numbers a row of a later migration’s table by its sequence, which it may use', async () => {
    const [{ n }] = await app<{ n: number }[]>`insert into later_counts (label) values ('first') returning n`;
    expect(n).toBeGreaterThan(0);
    await app`delete from later_counts where n = ${n}`;
  });

  it('cannot create, alter or drop the schema’s objects, the later migration’s table included', async () => {
    for (const statement of [
      'create table app_probe (id int)',
      'create view app_probe as select 1',
      "create function app_probe() returns int language sql as 'select 1'",
      'create schema app_probe',
      'create index app_probe_idx on nodes (id)',
      'create index app_probe_idx on later_things (label)',
      'alter table nodes add column app_probe int',
      'alter table later_things add column app_probe int',
      'drop table nodes',
      'drop table later_things',
      'drop function prop_safe_date(text)',
    ]) {
      // In a transaction rolled back, so one that is not refused changes nothing.
      await app.unsafe('begin');
      try {
        await expect(app.unsafe(statement), statement).rejects.toMatchObject({ code: '42501' });
      } finally {
        await app.unsafe('rollback');
      }
    }
  });

  it('owns nothing in the database, may create nothing in its schema or in it, and is no superuser', async () => {
    const [role] = await db`select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname = 'app_user'`;
    expect(role).toEqual({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
    const [create] = await db`
      select has_schema_privilege('app_user', 'public', 'CREATE') as schema,
             has_database_privilege('app_user', current_database(), 'CREATE') as database`;
    expect(create).toEqual({ schema: false, database: false });
    const owned = await db<{ name: string }[]>`
      select relname::text as name from pg_class where relowner = 'app_user'::regrole
      union all select proname::text from pg_proc where proowner = 'app_user'::regrole
      union all select typname::text from pg_type where typowner = 'app_user'::regrole
      union all select nspname::text from pg_namespace where nspowner = 'app_user'::regrole`;
    expect(owned.map((r) => r.name)).toEqual([]);
  });

  it('may create nothing in its schema on a database begun on Postgres 14 or earlier, which granted that to PUBLIC', { timeout: 120_000 }, async () => {
    const fileUrl = process.env.DATABASE_URL!;
    const clone = new URL(fileUrl).pathname.slice(1);
    const runUrl = urlFor(fileUrl, clone.replace(/_int_c\d+_[a-z0-9]+$/, ''));
    const name = `${clone}_legacy`;
    const legacy = postgres(await createEmptyDatabase(runUrl, name), { max: 1, onnotice: () => {} });
    const mayCreate = async () => (await legacy<{ may: boolean }[]>`select has_schema_privilege('app_user', 'public', 'CREATE') as may`)[0].may;
    try {
      // What an older Postgres gave every new database.
      await legacy`grant create on schema public to public`;
      expect(await mayCreate()).toBe(true);
      await runMigrations(legacy);
      expect(await mayCreate()).toBe(false);
    } finally {
      await legacy.end({ timeout: 5 });
      await dropDatabase(runUrl, name);
    }
  });
});
