// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Gives each integration test file a clone of the seeded template of its own.
// A setup file runs before the test's imports, so the URL set here is the one
// platform/db.server binds.
import { afterAll, inject } from 'vitest';
import { baseName, cloneDatabase, dropDatabase, fileCloneName } from '../support/databases';

const runUrl = process.env.DATABASE_URL!;
const clone = fileCloneName(baseName(runUrl));
process.env.DATABASE_URL = await cloneDatabase(runUrl, inject('integrationTemplate'), clone);

afterAll(async () => {
  // Closed so the clone can be dropped; the drop ends anything else connected.
  const { db } = await import('../../src/lib/platform/db.server');
  await db.end({ timeout: 5 });
  await dropDatabase(runUrl, clone);
});
