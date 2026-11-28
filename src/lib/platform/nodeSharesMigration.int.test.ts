// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// migrations/0003_node_shares.sql on a database the migrations before it built,
// holding shares of a page and of a document
// (docs/adr/0027-one-rule-says-who-may-change-a-node.md). It goes with the
// migration when the migrations are squashed into a baseline.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations } from './migrate.server';
import { createEmptyDatabase, dropDatabase, urlFor } from '#tests/support/databases.ts';
import { databaseName } from '#tests/e2e/testDb.ts';

const MIGRATIONS = path.resolve(import.meta.dirname, '..', '..', '..', 'migrations');
const BEFORE = ['0001_baseline.sql', '0002_spaces.sql'];
const SHARES = '0003_node_shares.sql';

const clone = databaseName(process.env.DATABASE_URL!);
const runUrl = urlFor(process.env.DATABASE_URL!, clone.replace(/_int_c\d+_[a-z0-9]+$/, ''));
// Named as a clone is (`<clone>m<n>`), so a crashed run's sweep removes it.
const name = `${clone}m1`;

const DEFAULT_SPACE = '00000000-0000-4000-8000-000000000001';
const PAGE_CLASS = '00000000-0000-4000-8000-000000000003';
const DOCUMENT_CLASS = '00000000-0000-4000-8000-000000000004';
const PAGE = '20000000-0000-4000-8000-000000000001';
const DOCUMENT = '20000000-0000-4000-8000-000000000002';
const [ADA, BEA, CAL] = ['20000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000b2', '20000000-0000-4000-8000-0000000000c3'];

let dir: string;
let sql: postgres.Sql;

beforeAll(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'owlgraph-node-shares-'));
  for (const file of BEFORE) copyFileSync(path.join(MIGRATIONS, file), path.join(dir, file));
  sql = postgres(await createEmptyDatabase(runUrl, name), { max: 1, onnotice: () => {} });
  expect((await runMigrations(sql, dir)).applied).toEqual(BEFORE);

  for (const [id, who] of [[ADA, 'ada'], [BEA, 'bea'], [CAL, 'cal']]) {
    await sql`insert into users (id, email, name, password_hash, role) values (${id}, ${`${who}@example.test`}, ${who}, 'x', 'editor')`;
  }
  await sql`
    insert into nodes (id, type, slug, space_id, title, class_id, locale, visibility, created_by) values
      (${PAGE}, 'page', 'a-page', ${DEFAULT_SPACE}, 'A page', ${PAGE_CLASS}, 'en', 'restricted', ${ADA}),
      (${DOCUMENT}, 'document', 'a-document', ${DEFAULT_SPACE}, 'A document', ${DOCUMENT_CLASS}, 'en', 'restricted', ${ADA})`;
  await sql`insert into pages (id, search_locale) values (${PAGE}, 'en')`;
  await sql`insert into documents (id, source, external_url, search_locale) values (${DOCUMENT}, 'link', 'https://example.org/file', 'en')`;
  await sql`insert into page_shares (page_id, user_id) values (${PAGE}, ${BEA}), (${PAGE}, ${CAL})`;
  await sql`insert into document_shares (document_id, user_id) values (${DOCUMENT}, ${BEA})`;

  copyFileSync(path.join(MIGRATIONS, SHARES), path.join(dir, SHARES));
  expect((await runMigrations(sql, dir)).applied).toEqual([SHARES]);
});

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await dropDatabase(runUrl, name);
  rmSync(dir, { recursive: true, force: true });
});

const shares = async () =>
  (await sql<{ node_id: string; user_id: string }[]>`select node_id, user_id from node_shares order by node_id, user_id`).map((r) => [r.node_id, r.user_id]);

describe('one share list for every node', () => {
  it('keeps every share of a page and of a document, under the node', async () => {
    expect(await shares()).toEqual([
      [PAGE, BEA],
      [PAGE, CAL],
      [DOCUMENT, BEA],
    ]);
  });

  it('leaves no share table of a type behind', async () => {
    const left = await sql`select table_name from information_schema.tables where table_schema = 'public' and table_name in ('page_shares', 'document_shares')`;
    expect(left).toEqual([]);
  });

  it('drops a share with its node or its user', async () => {
    await sql`delete from users where id = ${CAL}`;
    await sql`delete from nodes where id = ${DOCUMENT}`;
    expect(await shares()).toEqual([[PAGE, BEA]]);
  });

  it('takes a share of any node, a collection too, once', async () => {
    const collection = '20000000-0000-4000-8000-000000000003';
    await sql`
      insert into nodes (id, type, slug, space_id, title, class_id, locale, visibility, created_by)
      values (${collection}, 'collection', 'a-collection', ${DEFAULT_SPACE}, 'A collection', '00000000-0000-4000-8000-000000000005', 'en', 'restricted', ${ADA})`;
    await sql`insert into node_shares (node_id, user_id) values (${collection}, ${BEA})`;
    await expect(sql`insert into node_shares (node_id, user_id) values (${collection}, ${BEA})`).rejects.toThrow(/node_shares_pkey/);
  });
});
