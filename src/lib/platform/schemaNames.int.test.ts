// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { db } from './db.server';

// The naming rule (docs/architecture/migrations.md, "Names") on the file's migrated clone:
// a constraint or index a later migration names by hand keeps its kind's suffix.

const SUFFIX: Record<string, string> = { p: '_pkey', u: '_key', f: '_fkey', c: '_check' };

describe('the names in the migrated schema', () => {
  it('end each constraint in the suffix Postgres gives its kind, and name a primary key after its table', async () => {
    const constraints = await db<{ table: string; name: string; kind: string }[]>`
      select c.conrelid::regclass::text as table, c.conname::text as name, c.contype::text as kind
      from pg_constraint c
      where c.connamespace = 'public'::regnamespace and c.contype in ('p', 'u', 'f', 'c')
      order by 1, 2`;
    expect(constraints.length).toBeGreaterThan(0);
    const misnamed = constraints
      .filter(({ table, name, kind }) => (kind === 'p' ? name !== `${table}_pkey` : !name.endsWith(SUFFIX[kind])))
      .map(({ table, name, kind }) => `${table}.${name}: should end in ${kind === 'p' ? `${table}_pkey` : SUFFIX[kind]}`);
    expect(misnamed).toEqual([]);
  });

  it('end each index that backs no primary key or unique constraint in _idx', async () => {
    const indexes = await db<{ table: string; name: string }[]>`
      select i.indrelid::regclass::text as table, ic.relname::text as name
      from pg_index i
      join pg_class ic on ic.oid = i.indexrelid
      where ic.relnamespace = 'public'::regnamespace
        and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid and c.contype in ('p', 'u', 'x'))
      order by 1, 2`;
    expect(indexes.length).toBeGreaterThan(0);
    expect(indexes.filter(({ name }) => !name.endsWith('_idx')).map(({ table, name }) => `${table}.${name}`)).toEqual([]);
  });
});
