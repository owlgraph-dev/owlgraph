// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The one place a test run creates or drops databases (docs/guides/testing.md, "The
// test databases"): a seeded template and its clones, which carry its rows
// exactly. Nothing is created or dropped whose name isn't derived from the
// run's test database.
import postgres from 'postgres';
import { databaseName, isTestDatabaseUrl } from '../e2e/testDb';

export type CloneKind = 'int' | 'e2e';

export const DEFAULT_DATABASE_URL = 'postgres://user:password@localhost:5432/owlgraph_test';

const NAME = /^[a-z_][a-z0-9_]*$/;

/** DATABASE_URL's database name, refusing anything but a test database. */
export function baseName(url: string): string {
  if (!isTestDatabaseUrl(url)) {
    throw new Error(`Refusing to work on DATABASE_URL that doesn't name a test database: "${redact(url)}". Point it at e.g. .../owlgraph_test.`);
  }
  const name = databaseName(url);
  if (!NAME.test(name)) throw new Error(`A test database name must be lowercase letters, digits and underscores: "${name}".`);
  return name;
}

export const templateName = (base: string, kind: CloneKind) => `${base}_${kind}_tpl`;
export const workerName = (base: string, slot: number) => `${base}_e2e_w${slot}`;
export const fileCloneName = (base: string) => `${base}_int_c${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

/** The same URL, naming another database on the same server. */
export function urlFor(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

/**
 * Throws unless `name` is derived from `base`, a clone's `<clone>_<suffix>`
 * databases included, so the next run's sweep can drop what a crash left.
 */
export function assertDisposable(base: string, name: string): void {
  const derived = new RegExp(`^${base}_(int_tpl|e2e_tpl|e2e_w\\d+|int_c\\d+_[a-z0-9]+(_[a-z0-9]+)*)$`);
  if (!derived.test(name) || !/test/i.test(name)) {
    throw new Error(`Refusing to create or drop "${name}": not a database this test run owns.`);
  }
}

const redact = (url: string) => url.replace(/\/\/[^@]*@/, '//');

// Two clones of one template at once can fail on each other's lock, and
// cloning can't run in a transaction: a session-level advisory lock serializes them.
const CLONE_LOCK = 987654322;

async function withAdmin<T>(url: string, run: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(urlFor(url, 'postgres'), { max: 1, onnotice: () => {} });
  try {
    return await run(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Drops `name` if it exists, ending any session on it. */
export async function dropDatabase(url: string, name: string): Promise<void> {
  assertDisposable(baseName(url), name);
  await withAdmin(url, (sql) => sql.unsafe(`drop database if exists "${name}" with (force)`));
}

/** A new, empty database `name` (dropped first if a crashed run left it). */
export async function createEmptyDatabase(url: string, name: string): Promise<string> {
  assertDisposable(baseName(url), name);
  await withAdmin(url, async (sql) => {
    await sql.unsafe(`drop database if exists "${name}" with (force)`);
    await sql.unsafe(`create database "${name}"`);
  });
  return urlFor(url, name);
}

/** A copy of `template` named `name`, as its URL; the template must have no open connection. */
export async function cloneDatabase(url: string, template: string, name: string): Promise<string> {
  const base = baseName(url);
  assertDisposable(base, template);
  assertDisposable(base, name);
  await withAdmin(url, async (sql) => {
    await sql`select pg_advisory_lock(${CLONE_LOCK})`;
    try {
      await sql.unsafe(`drop database if exists "${name}" with (force)`);
      await sql.unsafe(`create database "${name}" template "${template}"`);
    } catch (e) {
      const message = (e as Error).message;
      if (/being accessed by other users/.test(message)) {
        throw new Error(`Cannot clone ${template}: another session is connected to it (a server or a client left on it). ${message}`);
      }
      throw e;
    } finally {
      await sql`select pg_advisory_unlock(${CLONE_LOCK})`;
    }
  });
  return urlFor(url, name);
}

/** Drops what a crashed run left under `prefixes`; one still in use belongs to a run in progress. */
export async function sweep(url: string, prefixes: string[]): Promise<string[]> {
  const base = baseName(url);
  return withAdmin(url, async (sql) => {
    const rows = await sql<{ datname: string }[]>`
      select d.datname from pg_database d
      where not exists (select 1 from pg_stat_activity a where a.datname = d.datname)`;
    const dropped: string[] = [];
    for (const { datname } of rows) {
      if (!prefixes.some((p) => datname.startsWith(p))) continue;
      assertDisposable(base, datname);
      await sql.unsafe(`drop database if exists "${datname}"`);
      dropped.push(datname);
    }
    return dropped;
  });
}
