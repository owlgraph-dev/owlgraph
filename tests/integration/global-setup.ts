// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// One seeded template per run, which every test file clones
// (docs/guides/testing.md, "Integration tests"; tests/integration/database.ts).
import type { TestProject } from 'vitest/node';
import { DEFAULT_DATABASE_URL, baseName, createEmptyDatabase, sweep, templateName } from '../support/databases';
import type { SeedRecord } from '../support/seed';
import { buildState } from './build';
import { pgContainer } from './pg';

declare module 'vitest' {
  export interface ProvidedContext {
    /** The template every test file's database is cloned from. */
    integrationTemplate: string;
    /** The seeded ids, slugs, texts and tokens (tests/support/seed.ts). */
    seed: SeedRecord;
  }
}

export default async function setup(project: TestProject) {
  // The test files inherit this environment, so no developer's .env reaches
  // either: a path that doesn't exist.
  process.env.DOTENV_CONFIG_PATH = 'tests/integration/.no-env';
  process.env.LOG_LEVEL ??= 'silent';
  const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const base = baseName(url);
  const template = templateName(base, 'int');
  const clones = `${base}_int_c`;
  await sweep(url, [clones]);

  const templateUrl = await createEmptyDatabase(url, template);
  // The seed binds the database at import, so the URL is the template's then only.
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = templateUrl;
  try {
    const { prepareTestDatabase, closeSeedConnection } = await import('../support/seed');
    const { seed } = await prepareTestDatabase();
    // The template must have no open connection before anything clones it.
    await closeSeedConnection();
    project.provide('seed', seed);
  } finally {
    process.env.DATABASE_URL = previous;
  }
  project.provide('integrationTemplate', template);

  const build = buildState();
  if (!build.ready) console.log(`HTTP tests skipped: ${build.reason}`);
  // Under CI a missing container fails the operations tests themselves (pg.ts).
  const pg = process.env.CI ? null : pgContainer();
  if (pg?.skipped) console.log(`Operations tests skipped: ${pg.reason}`);

  return async () => {
    await sweep(url, [clones]);
  };
}
