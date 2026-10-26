// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { configDefaults, defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

// One project per test layer (docs/guides/testing.md, "Layers"); the `.spec.ts` e2e
// specs are Playwright's.

const LAYERED = ['**/*.int.test.ts', '**/*.http.test.ts', '**/*.svelte.test.ts'];

// Its name must contain "test"; the integration project clones it per file
// (tests/support/databases.ts). `.env` is never consulted for it.
const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:password@localhost:5432/owlgraph_test';

export default defineConfig({
  // The public renderer server-renders a block's Svelte component
  // (blocks/scaffold/ssrBlock.ts). No svelte.config.js: Kit's options are the app's.
  plugins: [svelte({ configFile: false, hot: false })],
  resolve: {
    alias: { $lib: path.resolve('./src/lib'), $tests: path.resolve('./tests') },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: [...configDefaults.exclude, ...LAYERED],
          environment: 'node',
          // Threads, not processes: still a fresh module graph per file, but far
          // faster to start.
          pool: 'threads',
          env: {
            // Only so modules that touch the database load: a unit test connects to nothing.
            DATABASE_URL: 'postgres://test:test@localhost:5432/owlgraph_test',
            // A test that cares about a log line asserts on it.
            LOG_LEVEL: 'silent',
          },
        },
      },
      {
        extends: true,
        // One graphql: Vite resolves the ESM build while Pothos, imported
        // natively, loads the CommonJS one, and the schema refuses a value
        // "from another module or realm". Pinned to Pothos's copy.
        resolve: { alias: [{ find: /^graphql$/, replacement: path.resolve('node_modules/graphql/index.js') }] },
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.ts', 'src/**/*.http.test.ts', 'tests/**/*.int.test.ts'],
          environment: 'node',
          // A thread per file, with its own database URL, pool and caches.
          // Threads: a forked process fetches every module over IPC. Four at a
          // time bounds the connections.
          pool: 'threads',
          poolOptions: { threads: { maxThreads: 4, minThreads: 1 } },
          globalSetup: ['tests/integration/global-setup.ts'],
          setupFiles: ['tests/integration/database.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          // The built app is already compiled: imported natively, not through Vite.
          server: { deps: { external: [/[\\/]build[\\/]/] } },
          env: {
            DATABASE_URL: TEST_DATABASE_URL,
            // Four files' pools, a served build's and a script's stay under
            // Postgres's default of 100 connections.
            DB_POOL_MAX: '4',
            LOG_LEVEL: 'silent',
            APP_SECRET_KEY: randomBytes(32).toString('base64'),
            INTEGRATIONS_ALLOW_HTTP_LOOPBACK: '1',
            MCP_DISABLE_LISTEN: '1',
            // A path that doesn't exist: nothing from a developer's .env.
            DOTENV_CONFIG_PATH: path.resolve('tests/integration/.no-env'),
          },
        },
      },
      {
        extends: true,
        // Without SvelteKit: `$app/*` are stand-ins a test sets up (tests/component/app/).
        resolve: {
          alias: {
            '$app/state': path.resolve('./tests/component/app/state.svelte.ts'),
            '$app/stores': path.resolve('./tests/component/app/stores.ts'),
            '$app/navigation': path.resolve('./tests/component/app/navigation.ts'),
            '$app/environment': path.resolve('./tests/component/app/environment.ts'),
            '$app/forms': path.resolve('./tests/component/app/forms.ts'),
          },
        },
        test: {
          name: 'component',
          include: ['src/**/*.svelte.test.ts'],
          setupFiles: ['tests/component/setup.ts'],
          // Playwright's Chromium, no download of its own.
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
