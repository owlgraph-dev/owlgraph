// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import postgres from 'postgres';
import { describe, expect, inject, it } from 'vitest';
import { listDocumentsForUser } from '#lib/features/documents/server.ts';
import { getGraph } from '#lib/features/graph/server.ts';
import { getDefaultSpace, setSpaceAccessLevel } from '#lib/features/spaces/server.ts';
import { createPage, listPagesForUser, userCanReadPage } from '#lib/features/pages/server.ts';
import { runMigrations } from '#lib/platform/migrate.server.ts';
import { databaseName } from '#tests/e2e/testDb.ts';
import { userOf } from '#tests/integration/users.ts';
import { createEmptyDatabase, dropDatabase, urlFor } from '#tests/support/databases.ts';

// 002.11. The suite's seed opens the default space for its public fixtures
// (tests/support/seed.ts), so the level a new installation starts at is read
// from a database migrated here, and what a visitor finds at that level is
// asked of this file's own database, set back to it.

const seed = inject('seed');

/** The default space's level and the number of nodes on a database only the migrations have touched. */
async function newlyMigrated(): Promise<{ level: string; nodes: number }> {
  const clone = databaseName(process.env.DATABASE_URL!);
  // The run's base database, which this file's clone is named after.
  const runUrl = urlFor(process.env.DATABASE_URL!, clone.replace(/_int_c\d+_[a-z0-9]+$/, ''));
  const name = `${clone}_new`;
  const sql = postgres(await createEmptyDatabase(runUrl, name), { onnotice: () => {} });
  try {
    await runMigrations(sql);
    const [space] = await sql<{ access_level: string }[]>`select access_level from spaces where is_default`;
    const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from nodes`;
    return { level: space.access_level, nodes: count };
  } finally {
    await sql.end({ timeout: 5 });
    await dropDatabase(runUrl, name);
  }
}

describe('a new installation', () => {
  it('002.11 a newly migrated database has an internal default space and no node; while it is internal an anonymous visitor finds no node, by reading or by any list, and once an admin makes it public they find those that inherit it', async () => {
    expect(await newlyMigrated()).toEqual({ level: 'internal', nodes: 0 });

    const defaultSpace = await getDefaultSpace();
    await setSpaceAccessLevel(defaultSpace.id, 'internal');
    const written = await createPage('Written before the site opens', await userOf('editorA'));
    expect(await userCanReadPage(null, written)).toBe(false);
    expect((await getGraph(null)).nodes).toEqual([]);
    expect(await listPagesForUser(null)).toEqual([]);
    expect(await listDocumentsForUser(null)).toEqual([]);

    await setSpaceAccessLevel(defaultSpace.id, 'public');
    const found = (await getGraph(null)).nodes.map((n) => n.id);
    expect(found).toContain(written.id);
    expect(found).toContain(seed.publicId);
    // A node with a setting of its own stays as closed as it was.
    expect(found).not.toContain(seed.internalId);
    expect(found).not.toContain(seed.restrictedId);
  });
});
