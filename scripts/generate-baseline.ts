// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Generates the baseline (docs/architecture/migrations.md, "The baseline") from a database
// every migration built, and checks that a candidate builds the same database.
// It works on scratch databases beside the test database DATABASE_URL names,
// which it never touches, and drops them again; pg_dump runs in the Postgres
// container, as for db:dump-schema, so its version is the server's.
//   npm run db:generate-baseline -- --out=<file> --container=<name> [--migrations=<dir>] [--upgrade-through=<tag>]
//   npm run db:generate-baseline -- --check=<file> --container=<name> [--migrations=<dir>] [--schema=<schema.sql>]
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { safeDbName } from '../src/lib/platform/dbSetup.server';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

// Read before anything loads .env: only a database named as a test one is the
// base of the scratch databases.
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set: name a test database, e.g. postgres://user:password@localhost:5432/owlgraph_test.');
const base = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));
if (!/test/i.test(base)) throw new Error(`Refusing to work beside "${base}": DATABASE_URL must name a test database (its name contains "test").`);

const container = arg('container') ?? process.env.PG_CONTAINER;
if (!container || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) {
  throw new Error('Pass --container=<name> (or PG_CONTAINER): the Postgres container DATABASE_URL reaches, e.g. owlgraph-postgres.');
}
const out = arg('out');
const check = arg('check');
if (!out === !check) throw new Error('Pass one of --out=<file> (generate) and --check=<file> (compare a candidate with the migrations).');
const migrationsDir = path.resolve(arg('migrations') ?? 'migrations');
const upgradeThrough = arg('upgrade-through') ?? 'pre-baseline';
if (!/^\S+$/.test(upgradeThrough)) throw new Error(`Not a tag: "${upgradeThrough}".`);

// The runner logs a line per run; this script's output is its report.
process.env.LOG_LEVEL ||= 'warn';
const { runMigrations } = await import('../src/lib/platform/migrate.server');
const { migrationChecksums } = await import('../src/lib/platform/baseline.server');

const lf = (text: string) => text.replace(/\r\n/g, '\n');
const dbUrl = (database: string) => {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
};
/** A scratch database beside the base, never the base itself. */
const scratchName = (suffix: string) => safeDbName(`${base}_baseline_${suffix}`);

function docker(args: string[]): string {
  // stderr kept back: pg_dump warns of circular keys on every --data-only dump.
  return lf(execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }));
}
/** pg_dump in the container, with timestamps in UTC; without the `\restrict` lines, which carry a fresh key each run. */
function pgDump(database: string, flags: string[]): string {
  const dump = docker(['exec', '-e', 'PGTZ=UTC', container!, 'pg_dump', dbUrl(database), '--no-owner', '--exclude-table=schema_migrations', ...flags]);
  return dump.replace(/^\\(?:un)?restrict \S+\n/gm, '');
}
function psql(database: string, query: string): string {
  return docker(['exec', container!, 'psql', dbUrl(database), '-At', '-c', query]).trim();
}

async function withAdmin<T>(run: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(dbUrl('postgres'), { max: 1, onnotice: () => {} });
  try {
    return await run(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
const dropDatabase = (name: string) => withAdmin((sql) => sql.unsafe(`drop database if exists "${name}" with (force)`));

/** A new database `name` built by the migrations in `dir`, through the runner. */
async function build(name: string, dir: string): Promise<void> {
  await withAdmin(async (sql) => {
    await sql.unsafe(`drop database if exists "${name}" with (force)`);
    await sql.unsafe(`create database "${name}"`);
  });
  const sql = postgres(dbUrl(name), { max: 1, onnotice: () => {} });
  try {
    await runMigrations(sql, dir);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** The folder's migrations by number, as the runner orders them (it refuses a malformed folder itself). */
function migrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort((a, b) => Number(a.match(/^\d+/)![0]) - Number(b.match(/^\d+/)![0]));
}

/** A temporary folder holding `files` (paths), under their own names. */
function folderOf(files: string[]): { dir: string; remove: () => void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'owlgraph-baseline-'));
  for (const file of files) copyFileSync(file, path.join(dir, path.basename(file)));
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

// A timestamp no seed holds, so that only the seeds' own become now().
const SENTINEL = '2000-01-01 00:00:00+00';

const HEADER = `-- SPDX-License-Identifier: AGPL-3.0-only
-- Copyright (C) 2026 Alexander Rensch
-- This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

-- The baseline (docs/architecture/migrations.md, "The baseline"): the schema, its seed rows
-- and the app's role, as the migrations below built them. A new database runs
-- it; one that has applied every migration below records it in their place
-- without running it; one that has applied only some of them is refused.
-- Generated by scripts/generate-baseline.ts; never edited by hand.
--
`;

// The role and its privileges: pg_dump reads one database, while a role is the
// cluster's, its default privileges name the role that ran them, and from
// Postgres 15 on the REVOKE is the default it never writes (a cluster begun on
// 14 still needs it).
const ROLE_BLOCK = `
--
-- The app's role: reads and writes every table and uses every sequence, now
-- and later, and may create nothing. Its password comes from APP_DB_PASSWORD
-- (scripts/migrate.ts).
--

DO $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user with login;
  end if;
end
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
`;

/** The baseline of the database `name`, which the migrations in `dir` built. */
async function baselineOf(name: string, dir: string): Promise<string> {
  const files = migrationFiles(dir);
  const replaces = files.map((f) => `-- replaces: ${f.match(/^\d+/)![0]} ${f} ${migrationChecksums(readFileSync(path.join(dir, f), 'utf8')).join(' ')}`);

  const sql = postgres(dbUrl(name), { max: 1, onnotice: () => {} });
  try {
    const columns = await sql<{ table: string; column: string }[]>`
      select c.table_name::text as table, c.column_name::text as column
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.table_name <> 'schema_migrations'
        and c.data_type = 'timestamp with time zone' and c.is_generated = 'NEVER'
      order by 1, 2`;
    for (const { table, column } of columns) {
      await sql.unsafe(`update public."${table}" set "${column}" = $1 where "${column}" is not null`, [SENTINEL]);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  const lines = pgDump(name, ['--no-privileges', '--column-inserts']).split('\n');
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // psql's own commands and session settings, which would carry into the
    // next file on the runner's connection; the extension's own comment; the
    // version banner.
    if (/^SET [a-z_]+ = .*;$/.test(line) || line === "SELECT pg_catalog.set_config('search_path', '', false);") continue;
    if (/^COMMENT ON EXTENSION /.test(line) || /^-- Dumped (from|by) /.test(line)) continue;
    if (/^-- Name: EXTENSION \S+; Type: COMMENT;/.test(line) && kept.at(-1) === '--' && lines[i + 1] === '--') {
      kept.pop();
      i++;
      continue;
    }
    kept.push(line);
  }

  // The seeds: stamped at install, and their ids fixed by first appearance, so
  // one database always dumps to one file.
  const ids = new Map<string, string>();
  const body = kept
    .map((line) =>
      !line.startsWith('INSERT INTO ')
        ? line
        : line.replaceAll(`'${SENTINEL}'`, 'now()').replace(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/g, (_, id: string) => {
            if (!ids.has(id)) ids.set(id, `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, '0')}`);
            return `'${ids.get(id)}'`;
          })
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (body.includes(SENTINEL)) throw new Error(`The dump holds ${SENTINEL} outside a seed row's timestamp; refusing to guess what it is.`);

  return `${HEADER}-- upgrade-through: ${upgradeThrough}\n${replaces.join('\n')}\n\n${body}\n${ROLE_BLOCK}`;
}

/** What a baseline must reproduce of a database, each normalised so two builds compare. */
function snapshots(name: string): Record<string, string> {
  const grants = pgDump(name, ['--schema-only'])
    .split('\n')
    .filter((l) => /^(GRANT|REVOKE|ALTER DEFAULT)/.test(l))
    .sort();
  const ids = new Map<string, string>();
  const seeds = pgDump(name, ['--data-only', '--column-inserts'])
    .split('\n')
    .filter((l) => l.startsWith('INSERT INTO '))
    .map((l) =>
      l
        .replace(/'\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d+)?\+00'/g, '<timestamp>')
        .replace(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/g, (id) => {
          if (!ids.has(id)) ids.set(id, `<id ${ids.size + 1}>`);
          return ids.get(id)!;
        })
    );
  return {
    schema: pgDump(name, ['--schema-only', '--no-privileges']),
    privileges: [
      ...grants,
      `schema public: ${psql(name, "select array_to_string(array(select unnest(nspacl)::text order by 1), ',') from pg_namespace where nspname = 'public'")}`,
      `default privileges: ${psql(name, "select string_agg(pg_get_userbyid(defaclrole) || ' ' || defaclobjtype::text || ' ' || defaclacl::text, '; ' order by 1) from pg_default_acl")}`,
      `app_user: ${psql(name, "select 'login=' || rolcanlogin || ' superuser=' || rolsuper || ' createdb=' || rolcreatedb || ' createrole=' || rolcreaterole from pg_roles where rolname = 'app_user'")}`,
      `app_user may create in public: ${psql(name, "select has_schema_privilege('app_user', 'public', 'CREATE')")}`,
      `tables app_user cannot write: ${psql(name, "select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not has_table_privilege('app_user', c.oid, 'SELECT,INSERT,UPDATE,DELETE')")}`,
    ].join('\n'),
    'seed rows': seeds.join('\n'),
    extensions: psql(name, "select string_agg(extname || ' ' || extversion, ', ' order by oid) from pg_extension"),
  };
}

/** The first line two texts differ on, for the report. */
function firstDifference(a: string, b: string): string {
  const [x, y] = [a.split('\n'), b.split('\n')];
  const at = x.findIndex((line, i) => line !== y[i]);
  const i = at === -1 ? x.length : at;
  return `line ${i + 1}: "${x[i] ?? '(end)'}" against "${y[i] ?? '(end)'}"`;
}

if (out) {
  const name = scratchName('from_migrations');
  try {
    await build(name, migrationsDir);
    const baseline = await baselineOf(name, migrationsDir);
    writeFileSync(out, baseline);
    console.log(`Wrote ${out}: the baseline of ${migrationFiles(migrationsDir).length} migrations, ${baseline.split('\n').length} lines.`);
  } finally {
    await dropDatabase(name);
  }
} else {
  const candidate = path.resolve(check!);
  const fromMigrations = scratchName('from_migrations');
  const fromCandidate = scratchName('from_candidate');
  const replaced = folderOf(migrationFiles(migrationsDir).map((f) => path.join(migrationsDir, f)).filter((f) => path.resolve(f) !== candidate));
  const alone = folderOf([candidate]);
  const failures: string[] = [];
  try {
    await build(fromMigrations, replaced.dir);
    await build(fromCandidate, alone.dir);
    const [a, b] = [snapshots(fromMigrations), snapshots(fromCandidate)];
    const schemaFile = arg('schema');
    if (schemaFile) {
      // schema.sql is the same dump under a header of its own.
      const snapshot = lf(readFileSync(schemaFile, 'utf8'));
      a[`${path.basename(schemaFile)}`] = snapshot.slice(snapshot.indexOf('--\n-- PostgreSQL database dump'));
      b[`${path.basename(schemaFile)}`] = b.schema;
    }
    for (const what of Object.keys(a)) {
      const same = a[what] === b[what];
      console.log(`${same ? 'PASS' : 'FAIL'}  ${what}${same ? '' : ` — ${firstDifference(a[what], b[what])}`}`);
      if (!same) failures.push(what);
    }
  } finally {
    await dropDatabase(fromMigrations);
    await dropDatabase(fromCandidate);
    replaced.remove();
    alone.remove();
  }
  if (failures.length) {
    console.error(`${path.basename(candidate)} does not build what the migrations build: ${failures.join(', ')} differ.`);
    process.exit(1);
  }
  console.log(`${path.basename(candidate)} builds what the ${migrationFiles(migrationsDir).filter((f) => path.resolve(migrationsDir, f) !== candidate).length} migrations build.`);
}
process.exit(0);
