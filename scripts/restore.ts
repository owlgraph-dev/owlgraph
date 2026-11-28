// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Restores a backup (docs/guides/backup.md). Requires --yes, and refuses a dump with
// a migration this checkout lacks (a downgrade, which forward-only migrations
// don't support) and one from before the baseline that has applied only some
// of the migrations it replaces. The target's public schema is emptied and the
// dump restored into it in one transaction, so nothing a later migration made
// is left behind, and a restore that fails changes nothing. Afterwards migrates
// the restored state forward.
//   npm run db:restore -- --file=<path> [--db=<name>] [--container=<name>] --yes
import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { restoreVerdictForDump } from '../src/lib/platform/migrate.server';
import { execInPostgres, pgTargetDescription, readDumpMigrations, runMigrateService, safeIdentifier } from './lib/pgContainer';

// Drops what the public schema holds — tables, views, sequences, functions,
// types — but the schema itself and what an extension owns. The schema keeps
// its grant to the app role and the default privileges the baseline set on it,
// which give every table the restore makes the app role's access: the restore
// runs with --no-privileges, and the dump's --clean never touches the schema.
const EMPTY_PUBLIC = `DO $empty$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT format('DROP %s IF EXISTS %s CASCADE',
             CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'S' THEN 'SEQUENCE' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,
             c.oid::regclass) AS stmt
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
    ORDER BY c.relkind = 'S'
  LOOP
    EXECUTE item.stmt;
  END LOOP;
  FOR item IN
    SELECT format('DROP %s IF EXISTS %s CASCADE', CASE p.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END, p.oid::regprocedure) AS stmt
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE item.stmt;
  END LOOP;
  FOR item IN
    SELECT format('DROP %s IF EXISTS %s CASCADE', CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, t.oid::regtype) AS stmt
    FROM pg_type t
    LEFT JOIN pg_class c ON c.oid = t.typrelid
    WHERE t.typnamespace = 'public'::regnamespace
      AND (t.typtype IN ('d', 'e', 'r') OR (t.typtype = 'c' AND c.relkind = 'c'))
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE item.stmt;
  END LOOP;
END
$empty$;`;

/**
 * The shell command that restores the dump on its stdin into `db`: the
 * emptying above, then the dump as pg_restore writes it out as SQL, in one
 * transaction that psql commits only once pg_restore has read the whole dump.
 * Any error stops psql, and the server rolls the transaction back.
 */
const restoreCommand = (db: string) =>
  [
    '{',
    "cat <<'SQL'",
    'BEGIN;',
    'SET client_min_messages = warning;',
    EMPTY_PUBLIC,
    'SQL',
    'if pg_restore -f - --clean --if-exists --no-owner --no-privileges; then',
    "  echo 'COMMIT;'",
    'else',
    "cat <<'SQL'",
    "DO $$ BEGIN RAISE EXCEPTION 'The dump could not be read.'; END $$;",
    'SQL',
    'fi',
    // The script's own results (the search_path it sets) are of no use here; errors go to stderr.
    `} | psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ${db} > /dev/null`,
  ].join('\n');

const fileArg = process.argv.find((a) => a.startsWith('--file='));
const dbArg = process.argv.find((a) => a.startsWith('--db='));
const yes = process.argv.includes('--yes');

if (!fileArg) {
  throw new Error(
    'Usage: npm run db:restore -- --file=<path> [--db=<name>] [--container=<name>] --yes\n' +
      'Restores a full pg_dump (-Fc) artifact into the compose Postgres (or the container named by\n' +
      '--container=/PG_CONTAINER). Destructive — overwrites the target database.'
  );
}
const file = fileArg.slice('--file='.length);
const dbOverride = dbArg ? safeIdentifier(dbArg.slice('--db='.length)) : undefined;
const defaultDb = process.env.POSTGRES_DB;
if (!dbOverride && !defaultDb) {
  throw new Error('POSTGRES_DB is not set (copy .env.example to .env) and no --db override was given.');
}
const targetDb = dbOverride ?? defaultDb!;
const isRealTarget = targetDb === defaultDb;

console.log(
  `About to restore "${file}" into database "${targetDb}" on ${pgTargetDescription()}, ` +
    'overwriting its current contents.'
);
if (!yes) {
  throw new Error('Refusing to proceed without --yes.');
}

console.log("Checking the dump's migrations against this checkout's...");
const verdict = restoreVerdictForDump(await readDumpMigrations(file));
if (!verdict.ok) throw new Error(verdict.reason);

const dbFlag = dbOverride ? targetDb : '"$POSTGRES_DB"';
try {
  await execInPostgres(restoreCommand(dbFlag), { stdin: createReadStream(file) });
} catch {
  // psql has said why, above; the command itself is no help to an operator.
  throw new Error(`The restore into "${targetDb}" failed, and nothing was changed: the database is as it was before.`);
}
console.log(`Restored into "${targetDb}".`);

if (isRealTarget) {
  console.log('Running the migrate service to carry the restored state forward...');
  await runMigrateService();
} else {
  console.log(`Skipping migrate (target "${targetDb}" is not the primary database "${defaultDb}").`);
}
