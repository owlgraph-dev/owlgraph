// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// migrations/0004_node_class_statements.sql on a database the migrations before
// it built, holding a plain page and a document of a class of its own
// (docs/features/006-semantic-layer.md, criterion 6). It goes with the
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
const BEFORE = ['0001_baseline.sql', '0002_spaces.sql', '0003_node_shares.sql'];
const STATEMENTS = '0004_node_class_statements.sql';

const clone = databaseName(process.env.DATABASE_URL!);
const runUrl = urlFor(process.env.DATABASE_URL!, clone.replace(/_int_c\d+_[a-z0-9]+$/, ''));
// Named as a clone is (`<clone>m<n>`), so a crashed run's sweep removes it.
const name = `${clone}m2`;

const DEFAULT_SPACE = '00000000-0000-4000-8000-000000000001';
const PAGE_CLASS = '00000000-0000-4000-8000-000000000003';
const DOCUMENT_CLASS = '00000000-0000-4000-8000-000000000004';
const INVOICE = '30000000-0000-4000-8000-0000000000c1';
const PAGE = '30000000-0000-4000-8000-000000000001';
const DOCUMENT = '30000000-0000-4000-8000-000000000002';

let dir: string;
let sql: postgres.Sql;

beforeAll(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'owlgraph-node-classes-'));
  for (const file of BEFORE) copyFileSync(path.join(MIGRATIONS, file), path.join(dir, file));
  sql = postgres(await createEmptyDatabase(runUrl, name), { max: 1, onnotice: () => {} });
  expect((await runMigrations(sql, dir)).applied).toEqual(BEFORE);

  await sql`
    insert into node_classes (id, slug, label, description, kind, parent_id, parent_kind, node_type, parent_node_type)
    values (${INVOICE}, 'invoice', '{"en":"Invoice"}', '{}', 'domain', ${DOCUMENT_CLASS}, 'type', 'document', 'document')`;
  await sql`
    insert into nodes (id, type, slug, space_id, title, class_id, locale) values
      (${PAGE}, 'page', 'a-page', ${DEFAULT_SPACE}, 'A page', ${PAGE_CLASS}, 'en'),
      (${DOCUMENT}, 'document', 'an-invoice', ${DEFAULT_SPACE}, 'An invoice', ${INVOICE}, 'en')`;
  await sql`insert into pages (id, search_locale) values (${PAGE}, 'en')`;
  await sql`insert into documents (id, source, external_url, search_locale) values (${DOCUMENT}, 'link', 'https://example.org/file', 'en')`;

  copyFileSync(path.join(MIGRATIONS, STATEMENTS), path.join(dir, STATEMENTS));
  expect((await runMigrations(sql, dir)).applied).toEqual([STATEMENTS]);
});

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await dropDatabase(runUrl, name);
  rmSync(dir, { recursive: true, force: true });
});

const statements = async () =>
  (await sql<{ node_id: string; class_id: string }[]>`select node_id, class_id from node_class_statements order by node_id`).map((r) => [r.node_id, r.class_id]);

describe('a node’s classes as statements', () => {
  it('keeps the class every node had, as its one statement, and leaves no class on the node', async () => {
    expect(await statements()).toEqual([
      [PAGE, PAGE_CLASS],
      [DOCUMENT, INVOICE],
    ]);
    const left = await sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'nodes' and column_name = 'class_id'`;
    expect(left).toEqual([]);
  });

  it('takes a second class of the node’s type, and refuses one of another type', async () => {
    await sql`insert into node_class_statements (node_id, class_id, node_type) values (${DOCUMENT}, ${DOCUMENT_CLASS}, 'document')`;
    await expect(sql`insert into node_class_statements (node_id, class_id, node_type) values (${PAGE}, ${INVOICE}, 'page')`).rejects.toThrow(
      /node_class_statements_class_type_fkey/
    );
    await expect(sql`insert into node_class_statements (node_id, class_id, node_type) values (${PAGE}, ${INVOICE}, 'document')`).rejects.toThrow(
      /node_class_statements_node_fkey/
    );
  });

  it('keeps a class a node has, and drops the statements with their node', async () => {
    await expect(sql`delete from node_classes where id = ${INVOICE}`).rejects.toThrow(/node_class_statements_class/);
    await sql`delete from nodes where id = ${DOCUMENT}`;
    expect(await statements()).toEqual([[PAGE, PAGE_CLASS]]);
    await sql`delete from node_classes where id = ${INVOICE}`;
  });
});
