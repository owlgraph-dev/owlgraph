// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The baseline (docs/architecture/migrations.md, "The baseline"): the lowest-numbered
// migration may stand in for the migrations it replaces, which its header
// lists with both checksums. Pure: what a header says, what a database's
// schema_migrations rows make of it, and the messages either way. The runner
// (migrate.server.ts) and the restore scripts act on the verdicts.
import { createHash } from 'node:crypto';

/** A migration file's checksums: over its LF text, and over its CRLF text, which older rows may hold. */
export function migrationChecksums(contents: string): [lf: string, crlf: string] {
  const lf = contents.replace(/\r\n/g, '\n');
  const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
  return [sha256(lf), sha256(lf.replace(/\n/g, '\r\n'))];
}

export interface ReplacedMigration {
  version: string;
  filename: string;
  /** LF, then CRLF: a row holding either is this migration. */
  checksums: [string, string];
}

export interface Baseline {
  version: string;
  filename: string;
  checksums: [string, string];
  /** The release to upgrade through first: the last one with the replaced files. */
  upgradeThrough: string;
  /** In the header's order. */
  replaces: ReplacedMigration[];
}

export interface MigrationRow {
  version: string;
  filename: string;
  checksum: string;
}

export type RefusalCause = 'partial' | 'mismatch' | 'foreign';

export type BaselineState =
  /** No baseline in the folder. */
  | { kind: 'none' }
  /** Nothing recorded: the baseline runs like any file. */
  | { kind: 'fresh' }
  /** The baseline is recorded. */
  | { kind: 'adopted' }
  /** Every replaced migration is recorded as listed, so the baseline is recorded in their place; `extra` are the other rows, kept. */
  | { kind: 'adopt'; extra: string[] }
  | { kind: 'refused'; cause: RefusalCause; reason: string };

/** A database that must not be migrated: scripts/migrate.ts prints the message alone. */
export class MigrationRefused extends Error {
  override name = 'MigrationRefused';
}

const REPLACES = /^-- replaces: (\d+) (\S+\.sql) ([0-9a-f]{64}) ([0-9a-f]{64})$/;
const UPGRADE_THROUGH = /^-- upgrade-through: (\S+)$/;
const HEADER_LINE = /^-- (replaces|upgrade-through):/;

/**
 * The baseline among `files` (in version order), or null. Only the first may
 * carry a header; a malformed or repeated line, or a header line in any other
 * file, throws, naming the file and line.
 */
export function readBaseline(files: readonly { version: string; filename: string; contents: string }[]): Baseline | null {
  let baseline: Baseline | null = null;
  for (const [index, file] of files.entries()) {
    const replaces: ReplacedMigration[] = [];
    let upgradeThrough: string | null = null;
    for (const [at, line] of file.contents.replace(/\r\n/g, '\n').split('\n').entries()) {
      if (!HEADER_LINE.test(line)) continue;
      const where = `line ${at + 1} of ${file.filename}`;
      if (index > 0) throw new Error(`A baseline header belongs in the lowest-numbered migration only, not on ${where}: ${line}`);
      const replaced = REPLACES.exec(line);
      const through = UPGRADE_THROUGH.exec(line);
      if (replaced) {
        const [, version, filename, lf, crlf] = replaced;
        if (!filename.startsWith(`${version}_`)) throw new Error(`Malformed baseline header, ${where}: ${filename} is not the file of version ${version}.`);
        if (replaces.some((r) => r.version === version)) throw new Error(`Baseline header repeats version ${version}, ${where}: ${line}`);
        replaces.push({ version, filename, checksums: [lf, crlf] });
      } else if (through) {
        if (upgradeThrough !== null) throw new Error(`Baseline header repeats its upgrade-through line, ${where}: ${line}`);
        upgradeThrough = through[1];
      } else {
        throw new Error(`Malformed baseline header, ${where}: ${line}`);
      }
    }
    if (index > 0 || (replaces.length === 0 && upgradeThrough === null)) continue;
    if (upgradeThrough === null) throw new Error(`Baseline header of ${file.filename} has no "-- upgrade-through: <tag>" line.`);
    if (replaces.length === 0) throw new Error(`Baseline header of ${file.filename} has no "-- replaces:" line.`);
    baseline = { version: file.version, filename: file.filename, checksums: migrationChecksums(file.contents), upgradeThrough, replaces };
  }
  return baseline;
}

const byNumber = (a: { version: string }, b: { version: string }) => Number(a.version) - Number(b.version);

type Classification =
  | { kind: 'fresh' | 'adopted' }
  | { kind: 'adopt'; extra: string[] }
  | { kind: 'partial'; n: number; total: number; latest: string; last: string }
  | { kind: 'mismatch'; k: number; filenames: string }
  | { kind: 'foreign'; n: number; first: string };

function classify(baseline: Baseline, rows: readonly MigrationRow[]): Classification {
  if (rows.length === 0) return { kind: 'fresh' };
  const isBaseline = (r: MigrationRow) => r.version === baseline.version && r.filename === baseline.filename;
  if (rows.some((r) => isBaseline(r) && baseline.checksums.includes(r.checksum))) return { kind: 'adopted' };

  const replaced = new Map(baseline.replaces.map((r) => [r.version, r]));
  const matched: ReplacedMigration[] = [];
  const mismatched: ReplacedMigration[] = [];
  const extra: MigrationRow[] = [];
  for (const row of rows) {
    const entry = replaced.get(row.version);
    if (!entry) extra.push(row);
    else if (entry.filename === row.filename && entry.checksums.includes(row.checksum)) matched.push(entry);
    else mismatched.push(entry);
  }

  if (matched.length === 0) {
    // The baseline's own row under another checksum: verifyChecksums names it
    // modified after being applied, as it would any file.
    if (rows.some(isBaseline)) return { kind: 'adopted' };
    return { kind: 'foreign', n: rows.length, first: [...rows].sort(byNumber)[0].filename };
  }
  if (mismatched.length > 0) return { kind: 'mismatch', k: mismatched.length, filenames: mismatched.sort(byNumber).map((m) => m.filename).join(', ') };
  if (matched.length < baseline.replaces.length) {
    return {
      kind: 'partial',
      n: matched.length,
      total: baseline.replaces.length,
      latest: matched.sort(byNumber).at(-1)!.filename,
      last: baseline.replaces.at(-1)!.filename,
    };
  }
  return { kind: 'adopt', extra: extra.sort(byNumber).map((r) => r.filename) };
}

/** What `rows` make of `baseline`: go on, record it in place of what it replaces, or refuse with the reason. */
export function baselineState(baseline: Baseline | null, rows: readonly MigrationRow[]): BaselineState {
  if (!baseline) return { kind: 'none' };
  const c = classify(baseline, rows);
  const b = baseline.filename;
  const tag = baseline.upgradeThrough;
  switch (c.kind) {
    case 'partial':
      return {
        kind: 'refused',
        cause: 'partial',
        reason: `Refusing to migrate: this database predates ${b} and has applied ${c.n} of the ${c.total} migrations it replaces, the last ${c.latest}. Nothing was changed. Upgrade it in two steps, with a backup before each: first with the release tagged ${tag}, whose migrate applies the rest up to ${c.last}; then with this release, whose migrate records ${b} in their place. See docs/guides/upgrading.md, "Across the baseline".`,
      };
    case 'mismatch':
      return {
        kind: 'refused',
        cause: 'mismatch',
        reason: `Refusing to migrate: this database records ${c.k} of the migrations ${b} replaces under another name or checksum (${c.filenames}). Nothing was changed. They were edited after being applied, so the baseline cannot stand in for this database's schema: bring it to the release tagged ${tag} and compare it with that release's schema.sql first. See docs/guides/upgrading.md, "Across the baseline".`,
      };
    case 'foreign':
      return {
        kind: 'refused',
        cause: 'foreign',
        reason: `Refusing to migrate: schema_migrations records ${c.n} migration(s) (${c.first}…), but neither ${b} nor any migration it replaces. Nothing was changed. This database was not built by these migrations.`,
      };
    default:
      return c;
  }
}

/** Printed by scripts/migrate.ts when a run recorded the baseline in place of what it replaces. */
export function adoptedMessage(adopted: { baseline: string; replaced: number }): string {
  return `Adopted ${adopted.baseline} in place of ${adopted.replaced} migrations, without running it.`;
}

/** --mark-applied on a database the next migrate adopts. */
export function markAppliedRefusal(version: string, baseline: Baseline): string {
  return `Refusing to mark ${version} applied: this database has applied every migration ${baseline.filename} replaces. Run npm run db:migrate, which records ${baseline.filename} in their place.`;
}

export type RestoreVerdict = { ok: true; adopts: boolean } | { ok: false; reason: string };

/**
 * Whether a dump recording `rows` may be restored into a checkout whose
 * migrations are `versions`, decided before anything is restored: not one the
 * baseline refuses, and not one newer than the checkout (a version that is
 * neither a file here nor one the baseline replaces).
 */
export function restoreVerdict(baseline: Baseline | null, versions: readonly string[], rows: readonly MigrationRow[]): RestoreVerdict {
  const c = baseline ? classify(baseline, rows) : null;
  if (baseline && c) {
    const b = baseline.filename;
    const tag = baseline.upgradeThrough;
    const SEE = 'See docs/guides/backup.md, "Restoring a backup from before the baseline".';
    if (c.kind === 'partial') {
      return {
        ok: false,
        reason: `Refusing to restore: the dump predates ${b} and has applied ${c.n} of the ${c.total} migrations it replaces, the last ${c.latest}. Nothing was changed. Restore it with the release tagged ${tag}, whose migrate applies the rest up to ${c.last}; then run this release's migrate, which records ${b} in their place. ${SEE}`,
      };
    }
    if (c.kind === 'mismatch') {
      return {
        ok: false,
        reason: `Refusing to restore: the dump records ${c.k} of the migrations ${b} replaces under another name or checksum (${c.filenames}). Nothing was changed. They were edited after being applied, so the baseline cannot stand in for the dump's schema: restore it with the release tagged ${tag} and compare it with that release's schema.sql first. ${SEE}`,
      };
    }
    if (c.kind === 'foreign') {
      return {
        ok: false,
        reason: `Refusing to restore: the dump's schema_migrations records ${c.n} migration(s) (${c.first}…), but neither ${b} nor any migration it replaces. Nothing was changed. It was not built by these migrations.`,
      };
    }
  }
  const adopts = c?.kind === 'adopt';
  const known = new Set([...versions, ...(adopts ? baseline!.replaces.map((r) => r.version) : [])]);
  const unknown = [...new Set(rows.map((r) => r.version))].filter((v) => !known.has(v)).sort((x, y) => Number(x) - Number(y));
  if (unknown.length > 0) {
    return {
      ok: false,
      reason:
        `Refusing to restore: the dump has migration version(s) ${unknown.join(', ')} not present in this checkout's migrations/. ` +
        'Restoring a newer dump into an older app is not supported — check out the matching app version first.',
    };
  }
  return { ok: true, adopts };
}
