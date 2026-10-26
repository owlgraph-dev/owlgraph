// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Restores a backup into a scratch database, checks it against the live one
// and always drops it again (docs/guides/backup.md). Run right after
// `npm run db:backup` on the same file, so the comparisons see no drift.
// --db names the live database, as for the backup, and the scratch one after it.
//   npm run db:restore-test -- --file=<path> [--container=<name>] [--db=<name>]
import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { PassThrough } from 'node:stream';
import { restoreVerdictForDump } from '../src/lib/platform/migrate.server';
import { execInPostgres, pgTargetDescription, readDumpMigrations, safeIdentifier } from './lib/pgContainer';

const fileArg = process.argv.find((a) => a.startsWith('--file='));
if (!fileArg) {
  throw new Error('Usage: npm run db:restore-test -- --file=<path> [--container=<name>] [--db=<name>]');
}
const file = fileArg.slice('--file='.length);

const dbArg = process.argv.find((a) => a.startsWith('--db='));
const liveDb = dbArg ? safeIdentifier(dbArg.slice('--db='.length)) : process.env.POSTGRES_DB;
if (!liveDb) throw new Error('POSTGRES_DB is not set (copy .env.example to .env) and no --db was given.');
// Checked for its length: cut short, `<name>_rt` can be the live database itself.
const SCRATCH_DB = dbArg ? safeIdentifier(`${liveDb}_rt`) : 'restore_test_scratch';

async function psql(db: string, sql: string): Promise<string> {
  const chunks: Buffer[] = [];
  const collector = new PassThrough();
  collector.on('data', (chunk) => chunks.push(chunk));
  await execInPostgres(`psql -U "$POSTGRES_USER" -d ${db} -tA -c "${sql.replace(/"/g, '\\"')}"`, {
    stdout: collector
  });
  return Buffer.concat(chunks).toString('utf8').trim();
}

const failures: string[] = [];
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

console.log(`Testing against ${pgTargetDescription()}.`);
console.log(`Dropping/recreating scratch database "${SCRATCH_DB}"...`);
await execInPostgres(`dropdb -U "$POSTGRES_USER" --if-exists ${SCRATCH_DB}`);
await execInPostgres(`createdb -U "$POSTGRES_USER" ${SCRATCH_DB}`);

try {
  console.log("Checking the dump's migrations against this checkout's...");
  // Not newer than the checkout, and not short of the baseline's migrations.
  const verdict = restoreVerdictForDump(await readDumpMigrations(file));
  check("dump migrations aren't newer than this checkout", verdict.ok, verdict.ok ? undefined : verdict.reason);

  console.log(`Restoring "${file}" into "${SCRATCH_DB}"...`);
  await execInPostgres(`pg_restore -U "$POSTGRES_USER" -d ${SCRATCH_DB} --no-owner --no-privileges`, {
    stdin: createReadStream(file)
  });

  const tableCount = await psql(SCRATCH_DB, "select count(*) from information_schema.tables where table_schema='public'");
  check('schema restored (public tables present)', Number(tableCount) > 0, `${tableCount} tables`);

  const migCount = await psql(SCRATCH_DB, 'select count(*) from schema_migrations');
  check('schema_migrations has rows', Number(migCount) > 0, `${migCount} rows`);

  const pgcrypto = await psql(SCRATCH_DB, "select count(*) from pg_extension where extname='pgcrypto'");
  check('pgcrypto extension present', Number(pgcrypto) === 1);

  const vector = await psql(SCRATCH_DB, "select count(*) from pg_extension where extname='vector'");
  if (Number(vector) > 0) {
    check('vector extension present', true);
  }

  const pagesTsv = await psql(SCRATCH_DB, 'select search_tsv is not null from pages limit 1');
  if (pagesTsv) check('pages.search_tsv computes', pagesTsv === 't', pagesTsv);

  const docsTsv = await psql(SCRATCH_DB, 'select search_tsv is not null from documents limit 1');
  if (docsTsv) check('documents.search_tsv computes', docsTsv === 't', docsTsv);

  // An older dump may lack collections; they compare only when both sides have them.
  const hasCollections = async (db: string) => (await psql(db, "select to_regclass('public.collections') is not null")) === 't';
  const restoredCollections = await hasCollections(SCRATCH_DB);
  if (!restoredCollections) console.log('SKIP  collections — the dump is from before them.');
  else {
    const collectionsTsv = await psql(SCRATCH_DB, 'select search_tsv is not null from collections limit 1');
    if (collectionsTsv) check('collections.search_tsv computes', collectionsTsv === 't', collectionsTsv);
  }

  if (restoredCollections && (await hasCollections(liveDb))) {
    const membership = "select (select count(*) from collections) || ':' || (select count(*) from edges where relationship_type = 'contains')";
    const liveMembership = await psql(liveDb, membership);
    check('collections and their members round-trip', liveMembership === (await psql(SCRATCH_DB, membership)), `collections:contains ${liveMembership}`);

    // Compared sealed: opening them takes the deployment's key, which no dump holds.
    const sealed = "select count(*) || ':' || coalesce(encode(digest(string_agg(node_id::text || '=' || plugin || '=' || sealed, ',' order by node_id), 'sha256'), 'hex'), '-') from node_source_secrets";
    const liveSealed = await psql(liveDb, sealed);
    if (liveSealed.startsWith('0:')) console.log('SKIP  sealed credentials round-trip — source database has none.');
    else check('sealed credentials round-trip', liveSealed === (await psql(SCRATCH_DB, sealed)), `${liveSealed.split(':')[0]} credential(s)`);
  }

  const hasConnections = async (db: string) => (await psql(db, "select to_regclass('public.user_connections') is not null")) === 't';
  if ((await hasConnections(SCRATCH_DB)) && (await hasConnections(liveDb))) {
    const connections = "select count(*) || ':' || coalesce(encode(digest(string_agg(id::text || '=' || plugin || '=' || status || '=' || sealed_credential, ',' order by id), 'sha256'), 'hex'), '-') from user_connections";
    const liveConnections = await psql(liveDb, connections);
    if (liveConnections.startsWith('0:')) console.log('SKIP  connections round-trip — source database has none.');
    else check('connections round-trip', liveConnections === (await psql(SCRATCH_DB, connections)), `${liveConnections.split(':')[0]} connection(s)`);
  }

  // A link document has no bytes to compare.
  const docId = await psql(liveDb, "select id from documents where source = 'upload' order by id limit 1");
  if (!docId) {
    console.log('SKIP  document byte round-trip — source database has no uploaded documents.');
  } else if (!/^[0-9a-f-]{36}$/i.test(docId)) {
    check('document byte round-trip', false, `unexpected id format: "${docId}"`);
  } else {
    const liveHash = await psql(liveDb, `select encode(digest(bytes, 'sha256'), 'hex') from documents where id = '${docId}'`);
    const restoredHash = await psql(
      SCRATCH_DB,
      `select encode(digest(bytes, 'sha256'), 'hex') from documents where id = '${docId}'`
    );
    check('document byte round-trip', liveHash.length > 0 && liveHash === restoredHash, `document ${docId}`);
  }
} finally {
  console.log(`Dropping scratch database "${SCRATCH_DB}"...`);
  await execInPostgres(`dropdb -U "$POSTGRES_USER" --if-exists ${SCRATCH_DB}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
