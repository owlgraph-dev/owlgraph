// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// migrations/0002_spaces.sql on a database the baseline built, holding what a
// query block stores before the rename (docs/adr/0022-namespaces-are-called-spaces.md).
// It goes with the migration when the migrations are squashed into a baseline.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations } from './migrate.server';
import { createEmptyDatabase, dropDatabase, urlFor } from '#tests/support/databases.ts';
import { databaseName } from '#tests/e2e/testDb.ts';

const MIGRATIONS = path.resolve(import.meta.dirname, '..', '..', '..', 'migrations');
const BASELINE = '0001_baseline.sql';
const RENAME = '0002_spaces.sql';

const clone = databaseName(process.env.DATABASE_URL!);
const runUrl = urlFor(process.env.DATABASE_URL!, clone.replace(/_int_c\d+_[a-z0-9]+$/, ''));
// Named as a clone is (`<clone>m<n>`), so a crashed run's sweep removes it.
const name = `${clone}m1`;

const DEFAULT_SPACE = '00000000-0000-4000-8000-000000000001';
const PAGE_CLASS = '00000000-0000-4000-8000-000000000003';
const PAGE = '10000000-0000-4000-8000-000000000001';
const VERSION = '10000000-0000-4000-8000-000000000002';
const OTHER_SPACE = '10000000-0000-4000-8000-000000000003';

const text = (value: string, propName: string) => ({ type: 'text', text: value, marks: [{ type: 'semanticProperty', attrs: { propName } }] });
const html = (value: string) => ({ type: 'htmlBlock', attrs: { blockId: 'h', html: value } });
const TOKENS = '<p>{{{namespace}}} {{{namespace:text}}} {{{namespace:core}}} {{{parameter:namespace}}} {{{title}}}</p>';
const spaceIs = (field: string) => ({ intrinsic: { field, operator: 'EQ', value: DEFAULT_SPACE } });

// Every form the rename rewrites, beside its neighbours that it leaves alone.
const queryBlock = {
  type: 'queryBlock',
  attrs: {
    blockId: 'q1',
    filter: {
      and: [spaceIs('NAMESPACE_ID'), { or: [spaceIs('NAMESPACE_ID'), { intrinsic: { field: 'TITLE', operator: 'CONTAINS', value: 'namespace' } }] }],
    },
    traversal: null,
    orderBy: { kind: 'INTRINSIC', name: 'namespaceId', direction: 'ASC' },
    mapping: {
      namespace: { source: 'namespace' },
      title: { source: 'namespace', transform: { kind: 'upper' } },
      'parameter:namespace': { source: 'title' },
    },
  },
  content: [
    {
      type: 'paragraph',
      content: [text('Space', 'namespace'), text('Param', 'parameter:namespace'), text('Prop', 'core:namespace')],
    },
    html(TOKENS),
  ],
};

const traversalBlock = {
  type: 'queryBlock',
  attrs: {
    blockId: 'q2',
    filter: null,
    traversal: {
      start: { filter: spaceIs('NAMESPACE_ID') },
      steps: [
        { edge: { type: 'cites', direction: 'OUTGOING' }, targetFilter: { or: [spaceIs('NAMESPACE_ID')] }, repeat: 1 },
        { edge: { type: 'cites', direction: 'OUTGOING' }, repeat: 2 },
      ],
    },
    // Without a kind a sort names a property, which keeps its name.
    orderBy: { name: 'namespaceId', direction: 'DESC' },
    mapping: null,
  },
  content: [],
};

// A query block inside a container, and the same forms outside any query block.
const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [text('Outside', 'namespace')] },
    html(TOKENS),
    { type: 'grid', attrs: { blockId: 'g' }, content: [{ type: 'gridCell', content: [queryBlock] }] },
    traversalBlock,
  ],
};

let dir: string;
let sql: postgres.Sql;

beforeAll(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'owlgraph-spaces-'));
  copyFileSync(path.join(MIGRATIONS, BASELINE), path.join(dir, BASELINE));
  sql = postgres(await createEmptyDatabase(runUrl, name), { max: 1, onnotice: () => {} });
  expect((await runMigrations(sql, dir)).applied).toEqual([BASELINE]);

  await sql`insert into namespaces (id, slug, name, access_level) values (${OTHER_SPACE}, 'handbook', 'Handbook', 'restricted')`;
  await sql`
    insert into nodes (id, type, slug, namespace_id, title, class_id, locale)
    values (${PAGE}, 'page', 'overview', ${DEFAULT_SPACE}, 'Overview', ${PAGE_CLASS}, 'en')`;
  await sql`insert into pages (id, doc, search_locale) values (${PAGE}, ${sql.json(doc)}, 'en')`;
  await sql`insert into node_versions (id, node_id, version_no, kind) values (${VERSION}, ${PAGE}, 1, 'manual')`;
  await sql`insert into page_versions (version_id, doc) values (${VERSION}, ${sql.json(doc)})`;
  await sql`insert into themes (scope_kind, scope_id, tokens) values ('namespace', ${OTHER_SPACE}, '{}')`;

  copyFileSync(path.join(MIGRATIONS, RENAME), path.join(dir, RENAME));
  expect((await runMigrations(sql, dir)).applied).toEqual([RENAME]);
});

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await dropDatabase(runUrl, name);
  rmSync(dir, { recursive: true, force: true });
});

type Doc = typeof doc;

async function stored(): Promise<{ page: Doc; version: Doc }> {
  const [page] = await sql<{ doc: Doc }[]>`select doc from pages where id = ${PAGE}`;
  const [version] = await sql<{ doc: Doc }[]>`select doc from page_versions where version_id = ${VERSION}`;
  return { page: page.doc, version: version.doc };
}

// The documents as they should read after the rename.
const spaceTokens = '<p>{{{space}}} {{{space:text}}} {{{namespace:core}}} {{{parameter:namespace}}} {{{title}}}</p>';
const expected = {
  type: 'doc',
  content: [
    doc.content[0],
    doc.content[1],
    {
      type: 'grid',
      attrs: { blockId: 'g' },
      content: [
        {
          type: 'gridCell',
          content: [
            {
              type: 'queryBlock',
              attrs: {
                ...queryBlock.attrs,
                filter: {
                  and: [spaceIs('SPACE_ID'), { or: [spaceIs('SPACE_ID'), { intrinsic: { field: 'TITLE', operator: 'CONTAINS', value: 'namespace' } }] }],
                },
                orderBy: { kind: 'INTRINSIC', name: 'spaceId', direction: 'ASC' },
                mapping: {
                  space: { source: 'space' },
                  title: { source: 'space', transform: { kind: 'upper' } },
                  'parameter:namespace': { source: 'title' },
                },
              },
              content: [
                { type: 'paragraph', content: [text('Space', 'space'), text('Param', 'parameter:namespace'), text('Prop', 'core:namespace')] },
                html(spaceTokens),
              ],
            },
          ],
        },
      ],
    },
    {
      ...traversalBlock,
      attrs: {
        ...traversalBlock.attrs,
        traversal: {
          start: { filter: spaceIs('SPACE_ID') },
          steps: [
            { edge: { type: 'cites', direction: 'OUTGOING' }, targetFilter: { or: [spaceIs('SPACE_ID')] }, repeat: 1 },
            { edge: { type: 'cites', direction: 'OUTGOING' }, repeat: 2 },
          ],
        },
      },
    },
  ],
};

describe('the rename of namespaces to spaces', () => {
  it('renames the tables and the columns, keeping every row', async () => {
    const spaces = await sql<{ id: string; slug: string | null }[]>`select id, slug from spaces order by slug nulls first`;
    expect(spaces.map((s) => s.id)).toEqual([DEFAULT_SPACE, OTHER_SPACE]);
    const [node] = await sql<{ space_id: string }[]>`select space_id from nodes where id = ${PAGE}`;
    expect(node.space_id).toBe(DEFAULT_SPACE);
    const [members] = await sql<{ n: number }[]>`select count(*)::int as n from space_members`;
    expect(members.n).toBe(0);
    const left = await sql`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and (table_name like '%namespace%' or column_name like '%namespace%')`;
    expect(left).toEqual([]);
  });

  it('renames every constraint and index named after a namespace', async () => {
    const left = await sql`
      select conname as name from pg_constraint where connamespace = 'public'::regnamespace and conname like '%namespace%'
      union all
      select indexname from pg_indexes where schemaname = 'public' and indexname like '%namespace%'`;
    expect(left).toEqual([]);
  });

  it('gives a scope that was a namespace the name of a space, and refuses the old one', async () => {
    const [theme] = await sql<{ scope_kind: string }[]>`select scope_kind from themes where scope_id = ${OTHER_SPACE}`;
    expect(theme.scope_kind).toBe('space');
    await expect(sql`insert into stylesheets (scope_kind, scope_id, name) values ('namespace', ${OTHER_SPACE}, 'x')`).rejects.toThrow(/stylesheets_scope_kind_check/);
  });

  it('rewrites the names a query block stores, at any depth, in a page and in its stored versions', async () => {
    const { page, version } = await stored();
    expect(page).toEqual(expected);
    expect(version).toEqual(expected);
  });

  it('leaves the functions it used behind no trace', async () => {
    const left = await sql`select proname from pg_proc where proname like 'spaces_0002_%'`;
    expect(left).toEqual([]);
  });
});
