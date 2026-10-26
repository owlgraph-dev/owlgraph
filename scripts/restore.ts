// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Restores a backup (docs/guides/backup.md). Requires --yes, and refuses a dump with
// a migration this checkout lacks (a downgrade, which forward-only migrations
// don't support) and one from before the baseline that has applied only some
// of the migrations it replaces. Afterwards migrates the restored state forward.
//   npm run db:restore -- --file=<path> [--db=<name>] [--container=<name>] --yes
import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { restoreVerdictForDump } from '../src/lib/platform/migrate.server';
import { execInPostgres, pgTargetDescription, readDumpMigrations, runMigrateService, safeIdentifier } from './lib/pgContainer';

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
await execInPostgres(`pg_restore -U "$POSTGRES_USER" -d ${dbFlag} --clean --if-exists --no-owner --no-privileges`, {
  stdin: createReadStream(file)
});
console.log(`Restored into "${targetDb}".`);

if (isRealTarget) {
  console.log('Running the migrate service to carry the restored state forward...');
  await runMigrateService();
} else {
  console.log(`Skipping migrate (target "${targetDb}" is not the primary database "${defaultDb}").`);
}
