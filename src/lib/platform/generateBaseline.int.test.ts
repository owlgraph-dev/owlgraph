// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrationChecksums, readBaseline } from './baseline.server';
import { pgContainer } from '$tests/integration/pg';
import { runScript } from '$tests/integration/scripts';

// scripts/generate-baseline.ts as an operator runs it, on a folder of three
// migrations: an extension, a table with a generated column and a seed that
// refers to itself, and the app role's grants. Its scratch databases are named
// after the file's clone, so a crashed run's sweep removes them.

const pg = pgContainer();
const env = { DATABASE_URL: process.env.DATABASE_URL, PG_CONTAINER: pg.skipped ? undefined : pg.name };

const MIGRATIONS: Record<string, string> = {
  '0001_crypto.sql': 'create extension if not exists pgcrypto;\n',
  '0002_things.sql':
    'create table things (\n' +
    '  id uuid primary key default gen_random_uuid(),\n' +
    '  parent_id uuid references things (id),\n' +
    '  name text not null,\n' +
    '  shout text generated always as (upper(name)) stored,\n' +
    '  created_at timestamptz not null default now(),\n' +
    '  retired_at timestamptz\n' +
    ');\n' +
    "insert into things (name) values ('root');\n" +
    "insert into things (name, parent_id) select 'leaf', id from things where name = 'root';\n",
  '0003_grants.sql':
    "do $$ begin if not exists (select 1 from pg_roles where rolname = 'app_user') then create role app_user with login; end if; end $$;\n" +
    'revoke create on schema public from public;\n' +
    'grant usage on schema public to app_user;\n' +
    'grant select, insert, update, delete on all tables in schema public to app_user;\n' +
    'grant usage, select on all sequences in schema public to app_user;\n' +
    'alter default privileges in schema public grant select, insert, update, delete on tables to app_user;\n' +
    'alter default privileges in schema public grant usage, select on sequences to app_user;\n',
};

let dir = '';
let out = '';
const generate = (file: string) => runScript('generate-baseline.ts', [`--out=${file}`, `--migrations=${path.join(dir, 'migrations')}`], env);
const check = (file: string) => runScript('generate-baseline.ts', [`--check=${file}`, `--migrations=${path.join(dir, 'migrations')}`], env);

beforeAll(async () => {
  if (pg.skipped) return;
  dir = mkdtempSync(path.join(os.tmpdir(), 'owlgraph-generate-'));
  const migrations = path.join(dir, 'migrations');
  mkdirSync(migrations);
  for (const [name, contents] of Object.entries(MIGRATIONS)) writeFileSync(path.join(migrations, name), contents);
  out = path.join(dir, '0001_baseline.sql');
  const run = await generate(out);
  expect(run.code, run.stdout + run.stderr).toBe(0);
}, 120_000);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(pg.skipped)('the generated baseline', () => {
  it('has a header that lists the three migrations with both their checksums and the tag to upgrade through, which the runner reads', () => {
    const text = readFileSync(out, 'utf8');
    expect(text.startsWith('-- SPDX-License-Identifier: AGPL-3.0-only\n')).toBe(true);
    const replaces = text.split('\n').filter((line) => line.startsWith('-- replaces: '));
    expect(replaces).toEqual(Object.entries(MIGRATIONS).map(([name, contents]) => `-- replaces: ${name.slice(0, 4)} ${name} ${migrationChecksums(contents).join(' ')}`));
    expect(text).toContain('\n-- upgrade-through: pre-baseline\n');
    const baseline = readBaseline([{ version: '0001', filename: '0001_baseline.sql', contents: text }]);
    expect(baseline?.replaces.map((r) => r.filename)).toEqual(Object.keys(MIGRATIONS));
  });

  it('carries the extension, the generated column, the seed rows with fixed ids and install-time stamps, and the role block, and no session setting', () => {
    const text = readFileSync(out, 'utf8');
    expect(text).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;');
    expect(text).toMatch(/shout text GENERATED ALWAYS AS \(upper\(name\)\) STORED/);
    const inserts = text.split('\n').filter((line) => line.startsWith('INSERT INTO public.things'));
    expect(inserts).toEqual([
      "INSERT INTO public.things (id, parent_id, name, created_at, retired_at) VALUES ('00000000-0000-4000-8000-000000000001', NULL, 'root', now(), NULL);",
      "INSERT INTO public.things (id, parent_id, name, created_at, retired_at) VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'leaf', now(), NULL);",
    ]);
    expect(text).toContain('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;');
    expect(text).not.toMatch(/^(SET |SELECT pg_catalog\.set_config|\\restrict|COMMENT ON EXTENSION|-- Dumped )/m);
  });

  it('builds what the migrations build, by --check: schema, privileges, seed rows and extensions', async () => {
    const run = await check(out);
    expect(run.code, run.stdout + run.stderr).toBe(0);
    for (const what of ['schema', 'privileges', 'seed rows', 'extensions']) expect(run.stdout).toContain(`PASS  ${what}\n`);
    expect(run.stdout).toContain('0001_baseline.sql builds what the 3 migrations build.');
  }, 120_000);

  it('fails --check when tampered with, naming what differs', async () => {
    const tampered = path.join(dir, 'tampered', '0001_baseline.sql');
    mkdirSync(path.dirname(tampered));
    writeFileSync(tampered, readFileSync(out, 'utf8').replace("'leaf'", "'twig'"));
    const run = await check(tampered);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain('PASS  schema\n');
    expect(run.stdout).toMatch(/FAIL {2}seed rows — line 2: .*'leaf'.* against .*'twig'/);
    expect(run.stderr).toContain('0001_baseline.sql does not build what the migrations build: seed rows differ.');
  }, 120_000);

  it('comes out byte for byte the same when generated again', async () => {
    const again = path.join(dir, 'again.sql');
    const run = await generate(again);
    expect(run.code, run.stdout + run.stderr).toBe(0);
    expect(readFileSync(again).equals(readFileSync(out))).toBe(true);
  }, 120_000);
});
