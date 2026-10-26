// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Forward-only migration runner (docs/architecture/migrations.md), under an advisory lock so
// concurrent runs can't collide. `NNNN_name.sql` runs in one transaction,
// `NNNN_name.no-tx.sql` without one (CREATE INDEX CONCURRENTLY). No
// down-migrations: rollback is a restore from backup. A baseline stands in for
// the migrations it replaces (baseline.server.ts).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type postgres from 'postgres';
import type { TxSql } from './db.server';
import { logEvent, logger } from './logger.server';
import {
  MigrationRefused,
  baselineState,
  markAppliedRefusal,
  migrationChecksums,
  readBaseline,
  restoreVerdict,
  type Baseline,
  type MigrationRow,
  type RefusalCause,
  type RestoreVerdict,
} from './baseline.server';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '..', '..', '..', 'migrations');

// Any fixed int no other advisory lock in this app uses.
const ADVISORY_LOCK_KEY = 72837401;

const FILENAME_RE = /^(\d+)_.+?(\.no-tx)?\.sql$/;

interface MigrationFile {
  version: string;
  filename: string;
  path: string;
  noTx: boolean;
}

function loadMigrationFiles(dir = migrationsDir): MigrationFile[] {
  const entries = readdirSync(dir).filter((f) => f.endsWith('.sql'));
  const files: MigrationFile[] = [];
  // By number: 0010 and 10 are one version, and 10000 comes after 9999.
  const seenVersions = new Map<number, string>();
  for (const filename of entries) {
    const m = FILENAME_RE.exec(filename);
    if (!m) {
      throw new Error(
        `Migration filename doesn't match NNNN_description[.no-tx].sql: ${filename}`
      );
    }
    const version = m[1];
    const noTx = Boolean(m[2]);
    const existing = seenVersions.get(Number(version));
    if (existing) {
      throw new Error(`Duplicate migration version ${version}: ${existing} and ${filename}`);
    }
    seenVersions.set(Number(version), filename);
    files.push({ version, filename, path: path.join(dir, filename), noTx });
  }
  return files.sort((a, b) => Number(a.version) - Number(b.version));
}

// A `$` after one is part of the name (`a$b`); an `E` before a quote is the
// escape-string prefix only when no name comes before it.
const IDENTIFIER_CHAR = /[A-Za-z0-9_$\u0080-￿]/;
// `$$` or `$name$`; a digit, but not first: `$1` is a parameter.
const DOLLAR_TAG = /\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/y;

// Splits a script at each top-level ';', keeping strings, quoted identifiers and
// dollar-quoted bodies as written and dropping comments (block comments nest).
// One left open is refused before anything runs: it would swallow the rest of
// the file, which would still be recorded as applied.
export function splitStatements(sql: string, source = 'the script'): string[] {
  const statements: string[] = [];
  const identifierChar = (c: string | undefined) => c !== undefined && IDENTIFIER_CHAR.test(c);
  const neverClosed = (what: string, at: number, hint = ''): never => {
    const line = sql.slice(0, at).split('\n').length;
    throw new Error(`The ${what} opened on line ${line} of ${source} is never closed${hint}.`);
  };
  let current = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const start = i;
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        const pair = sql.slice(i, i + 2);
        if (pair === '/*' || pair === '*/') {
          depth += pair === '/*' ? 1 : -1;
          i += 2;
        } else {
          i++;
        }
      }
      if (depth > 0) neverClosed('/* comment', start, ' (Postgres nests block comments: each /* inside one needs a */ of its own)');
      current += ' ';
      continue;
    }
    if (c === "'" || c === '"') {
      const backslashEscapes = c === "'" && (sql[i - 1] === 'E' || sql[i - 1] === 'e') && !identifierChar(sql[i - 2]);
      let j = i + 1;
      while (j < sql.length) {
        if (backslashEscapes && sql[j] === '\\') j += 2;
        else if (sql[j] === c && sql[j + 1] === c) j += 2;
        else if (sql[j] === c) break;
        else j++;
      }
      if (j >= sql.length) neverClosed(c === "'" ? 'quoted string' : 'quoted identifier', i);
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '$' && !identifierChar(sql[i - 1])) {
      DOLLAR_TAG.lastIndex = i;
      const tag = DOLLAR_TAG.exec(sql)?.[0];
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        if (close === -1) neverClosed(`${tag} body`, i);
        const end = close + tag.length;
        current += sql.slice(i, end);
        i = end;
        continue;
      }
    }
    if (c === ';') {
      statements.push(current);
      current = '';
    } else {
      current += c;
    }
    i++;
  }
  if (current.trim()) statements.push(current);
  return statements.map((s) => s.trim()).filter(Boolean);
}

// The checksum ignores line endings, so a CRLF and an LF checkout agree. Older
// rows may hold a CRLF checkout's hash, which verifyChecksums accepts too.
function checksum(contents: string): string {
  return migrationChecksums(contents)[0];
}

/** The folder's baseline, if its lowest-numbered file has a header; a malformed one throws. */
function baselineOf(files: MigrationFile[]): Baseline | null {
  return readBaseline(files.map((f) => ({ version: f.version, filename: f.filename, contents: readFileSync(f.path, 'utf8') })));
}

async function ensureMigrationsTable(sql: TxSql): Promise<void> {
  // `if not exists` alone still raises a NOTICE every run, logged as a warning.
  const [{ present }] = await sql<{ present: boolean }[]>`select to_regclass('public.schema_migrations') is not null as present`;
  if (present) return;
  await sql.unsafe(`
    create table if not exists schema_migrations (
      version    text primary key,
      filename   text not null,
      checksum   text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

// Advisory locks are session-scoped, so the run holds one reserved connection:
// through the pool, the unlock could go out on another and wedge later runs.
async function withMigrationLock<T>(
  sql: postgres.Sql,
  fn: (reserved: postgres.ReservedSql) => Promise<T>
): Promise<T> {
  const reserved = await sql.reserve();
  try {
    let locked = false;
    for (let attempt = 0; attempt < 10 && !locked; attempt++) {
      const rows = await reserved<{ locked: boolean }[]>`select pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) as locked`;
      locked = rows[0].locked;
      if (!locked) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!locked) {
      throw new Error(
        'Could not acquire the migration advisory lock after 10s — another migrate run may be in progress.'
      );
    }
    return await fn(reserved);
  } finally {
    await reserved`select pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
    await reserved.release();
  }
}

async function recordedRows(sql: TxSql): Promise<MigrationRow[]> {
  return [...(await sql<MigrationRow[]>`select version, filename, checksum from schema_migrations`)];
}

function byVersion(rows: MigrationRow[]): Map<string, { filename: string; checksum: string }> {
  return new Map(rows.map((r) => [r.version, { filename: r.filename, checksum: r.checksum }]));
}

// An applied file must never change: a mismatch aborts the run before any
// migration executes.
function verifyChecksums(
  files: MigrationFile[],
  applied: Map<string, { filename: string; checksum: string }>
): void {
  for (const file of files) {
    const row = applied.get(file.version);
    if (!row) continue;
    if (!migrationChecksums(readFileSync(file.path, 'utf8')).includes(row.checksum)) {
      throw new Error(
        `Migration ${file.filename} was modified after being applied (checksum mismatch). ` +
          'Forward-only migrations must never be edited once applied — add a new migration instead.'
      );
    }
    if (row.filename !== file.filename) {
      throw new Error(
        `Migration version ${file.version} is recorded as "${row.filename}" but the file on disk is "${file.filename}".`
      );
    }
  }
}

export interface Adoption {
  /** The baseline's file name, recorded in place of what it replaces. */
  baseline: string;
  /** How many recorded migrations it replaced. */
  replaced: number;
}

/**
 * Applies the pending migrations of `dir` (migrations/ unless a test names
 * another). A database that has applied every migration the baseline replaces
 * first has their rows replaced by the baseline's, without running it; one
 * that has applied only some of them is refused (MigrationRefused) before
 * anything is written.
 */
export async function runMigrations(sql: postgres.Sql, dir = migrationsDir): Promise<{ applied: string[]; adopted: Adoption | null }> {
  const files = loadMigrationFiles(dir);
  const baseline = baselineOf(files);
  return withMigrationLock(sql, async (reserved) => {
    await ensureMigrationsTable(reserved);
    let rows = await recordedRows(reserved);
    // Collected so a run logs one migrate.run line (docs/architecture/logging.md, "Lifecycle").
    const notes: string[] = [];
    const started = performance.now();

    const state = baselineState(baseline, rows);
    if (state.kind === 'refused') throw new MigrationRefused(state.reason);
    let adopted: Adoption | null = null;
    // Before verifyChecksums: until then the baseline's version is recorded
    // with the checksum of the file it replaces.
    if (state.kind === 'adopt' && baseline) {
      await reserved.unsafe('begin');
      try {
        await reserved`delete from schema_migrations where version = any(${baseline.replaces.map((r) => r.version)}::text[])`;
        await reserved`
          insert into schema_migrations (version, filename, checksum)
          values (${baseline.version}, ${baseline.filename}, ${baseline.checksums[0]})
        `;
        await reserved.unsafe('commit');
      } catch (err) {
        await reserved.unsafe('rollback');
        throw err;
      }
      adopted = { baseline: baseline.filename, replaced: baseline.replaces.length };
      if (state.extra.length) notes.push(`${baseline.filename} adopted; rows it does not list are kept: ${state.extra.join(', ')}`);
      rows = await recordedRows(reserved);
    }

    const applied = byVersion(rows);
    verifyChecksums(files, applied);

    const pending = files.filter((f) => !applied.has(f.version));
    const appliedNow: string[] = [];
    for (const file of pending) {
      const contents = readFileSync(file.path, 'utf8');
      const sum = checksum(contents);
      const statements = splitStatements(contents, `migration ${file.filename}`);

      if (file.noTx) {
        if (statements.length > 1) {
          notes.push(
            `${file.filename}: non-transactional (.no-tx.sql) migrations should contain exactly one statement; found ${statements.length}.`
          );
        }
        for (const stmt of statements) await reserved.unsafe(stmt);
        await reserved`
          insert into schema_migrations (version, filename, checksum)
          values (${file.version}, ${file.filename}, ${sum})
        `;
      } else {
        // A reserved connection has no sql.begin(): the transaction is driven by hand.
        await reserved.unsafe('begin');
        try {
          for (const stmt of statements) await reserved.unsafe(stmt);
          await reserved`
            insert into schema_migrations (version, filename, checksum)
            values (${file.version}, ${file.filename}, ${sum})
          `;
          await reserved.unsafe('commit');
        } catch (err) {
          await reserved.unsafe('rollback');
          throw err;
        }
      }
      appliedNow.push(file.filename);
    }
    logEvent(logger, 'migrate.run', {
      applied: appliedNow,
      adopted: adopted ?? undefined,
      outcome: 'ok',
      durationMs: Math.round(performance.now() - started),
      note: notes.length ? notes.join(' | ') : undefined,
    });
    return { applied: appliedNow, adopted };
  });
}

/**
 * For the restore scripts, before anything is restored: a dump recording
 * `rows` must be neither one the baseline refuses nor newer than this checkout
 * (a downgrade, which forward-only migrations don't support).
 */
export function restoreVerdictForDump(rows: MigrationRow[], dir = migrationsDir): RestoreVerdict {
  const files = loadMigrationFiles(dir);
  return restoreVerdict(baselineOf(files), files.map((f) => f.version), rows);
}

export interface MigrationStatus {
  applied: number;
  /** The highest-numbered applied file, or null. */
  latest: string | null;
  /** The files in `dir` not applied yet, in order; before an adoption, the baseline among them. */
  pending: string[];
  /** The next run records `baseline` in place of `replaced` migrations, without running it. */
  adopts: { baseline: string; replaced: number } | null;
  /** The next run refuses this database, for `cause`. */
  refused: { cause: RefusalCause; baseline: string; tag: string } | null;
}

/**
 * Applied versus shipped migrations, read-only, for the About page. The bundled
 * server passes `dir`: it can't find migrations/ from its own module.
 */
export async function migrationStatus(sql: TxSql, dir = migrationsDir): Promise<MigrationStatus> {
  const files = loadMigrationFiles(dir);
  const baseline = baselineOf(files);
  const rows = await recordedRows(sql);
  // By number, as the runner orders them: 10000_… is newer than 9999_….
  const latest = [...rows].sort((a, b) => Number(a.version) - Number(b.version)).at(-1)?.filename ?? null;
  const state = baselineState(baseline, rows);
  if (state.kind === 'refused' && baseline) {
    return { applied: rows.length, latest, pending: [], adopts: null, refused: { cause: state.cause, baseline: baseline.filename, tag: baseline.upgradeThrough } };
  }
  // Against the rows the adoption leaves: a replaced version may be a later file's number.
  const replaced = new Set(state.kind === 'adopt' && baseline ? baseline.replaces.map((r) => r.version) : []);
  const kept = new Set(rows.filter((r) => !replaced.has(r.version)).map((r) => r.version));
  return {
    applied: rows.length,
    latest,
    pending: files.filter((f) => !kept.has(f.version)).map((f) => f.filename),
    adopts: state.kind === 'adopt' && baseline ? { baseline: baseline.filename, replaced: baseline.replaces.length } : null,
    refused: null,
  };
}

// Records a migration as applied without running it, for a database whose
// schema was made by other means. Safe to re-run. Refused on a database the
// baseline refuses, and on one the next migrate adopts.
export async function markApplied(sql: postgres.Sql, version: string, dir = migrationsDir): Promise<void> {
  const files = loadMigrationFiles(dir);
  const baseline = baselineOf(files);
  const file = files.find((f) => f.version === version);
  if (!file) throw new Error(`No migration file found for version "${version}".`);
  const sum = checksum(readFileSync(file.path, 'utf8'));
  await withMigrationLock(sql, async (reserved) => {
    await ensureMigrationsTable(reserved);
    const state = baselineState(baseline, await recordedRows(reserved));
    if (state.kind === 'refused') throw new MigrationRefused(state.reason);
    if (state.kind === 'adopt' && baseline) throw new MigrationRefused(markAppliedRefusal(version, baseline));
    await reserved`
      insert into schema_migrations (version, filename, checksum)
      values (${file.version}, ${file.filename}, ${sum})
      on conflict (version) do nothing
    `;
  });
}
