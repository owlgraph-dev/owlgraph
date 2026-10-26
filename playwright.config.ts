// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { defineConfig, devices } from '@playwright/test';
import { registerHooks } from 'node:module';
import { randomBytes } from 'node:crypto';
import * as svelteHooks from './scripts/lib/svelte-hooks.mjs';

// The server modules the harness imports hold Svelte components, which this
// loader hook compiles. Registered in the config, after Playwright's own
// loader so it is asked first, in the runner and every worker.
registerHooks(svelteHooks);

// Its name must contain "test" (global-setup refuses anything else); set before
// anything imports the database module.
process.env.DATABASE_URL ??= 'postgres://user:password@localhost:5432/owlgraph_test';
const DATABASE_URL = process.env.DATABASE_URL;

// build, built or dev (docs/guides/testing.md, "Servers"); dev is never the gate.
const SERVER = process.env.E2E_SERVER ?? 'build';
if (!['build', 'built', 'dev'].includes(SERVER)) {
  throw new Error(`E2E_SERVER must be build, built or dev (got "${SERVER}")`);
}
const DEV = SERVER === 'dev';

// In the build modes each worker has a database and a server of its own
// (docs/guides/testing.md, "The test databases"). This file runs in every worker
// before any spec, so it points the worker at its pair by its slot, which a
// worker restarted after a failure keeps.
const SLOT = process.env.TEST_PARALLEL_INDEX;
if (!DEV && SLOT !== undefined) {
  const databases = JSON.parse(process.env.E2E_WORKER_DATABASES ?? '[]') as string[];
  const database = databases[Number(SLOT)];
  if (!database) throw new Error(`No database for worker slot ${SLOT}: global-setup gives every worker one (E2E_WORKER_DATABASES).`);
  process.env.DATABASE_URL = database;
}
const BASE_URL = DEV ? 'http://localhost:5173' : `http://localhost:${4174 + Number(SLOT ?? 0)}`;

// A sealing key and plain http to the specs' mock services on 127.0.0.1, which
// a deployment never allows (platform/upstream.server.ts).
const INTEGRATIONS_ENV = {
  APP_SECRET_KEY: process.env.APP_SECRET_KEY || randomBytes(32).toString('base64'),
  INTEGRATIONS_ALLOW_HTTP_LOOPBACK: '1',
};

// One lane per run (docs/guides/testing.md, "Lanes"). E2E_BRANDED_ACCENT=1 runs the
// design-system checks again under an extreme accent, site-wide for the whole
// lane, so nothing else runs beside it.
const LANE = process.env.E2E_BRANDED_ACCENT
  ? [
      { name: 'branded-accent-setup', testDir: 'tests/e2e', testMatch: 'branded-accent.setup.ts', teardown: 'branded-accent-teardown' },
      { name: 'branded-accent-teardown', testDir: 'tests/e2e', testMatch: 'branded-accent.teardown.ts' },
      {
        name: 'branded-accent',
        testMatch: '**/design-system/e2e/playground.spec.ts',
        // The tests whose checks derive from the accent.
        grep: /@branded/,
        dependencies: ['branded-accent-setup'],
        use: { ...devices['Desktop Chrome'] },
      },
    ]
  : [{ name: 'app', use: { ...devices['Desktop Chrome'] } }];

export default defineConfig({
  testDir: '.',
  testMatch: ['src/**/e2e/*.spec.ts', 'tests/e2e/journeys/*.spec.ts'],
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  // Within a minute of 8 workers at half the load: headroom for a slower CI machine.
  workers: 4,
  // A failure is fixed at its cause, never retried away (docs/guides/testing.md).
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: BASE_URL,
  },
  // The build modes' servers are global-setup's (tests/e2e/servers.ts).
  webServer: DEV
    ? {
        command: 'npm run dev -- --strictPort',
        // Not a page route: the root layout's load fails until global-setup has
        // migrated, which runs only once this server is ready.
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: true,
        timeout: 120_000,
        env: { ...process.env, DATABASE_URL, ...INTEGRATIONS_ENV },
      }
    : undefined,
  projects: LANE,
});
