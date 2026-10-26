// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { FullConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { baseName, cloneDatabase, createEmptyDatabase, sweep, templateName, workerName } from '../support/databases';
import type { PreparedSeed } from '../support/seed';
import { assertPortsFree, startWorkerServers, workerPort } from './servers';

const here = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(here, '.auth');

// A session made a moment ago exists nowhere else, so anything but a 200 means
// the server reads another database, typically a reused dev server's.
async function assertServerSeesSeed(baseURL: string, sessionToken: string, database: string) {
  const res = await fetch(`${baseURL}/settings/profile`, { headers: { cookie: `session=${sessionToken}` }, redirect: 'manual' });
  if (res.status !== 200) {
    throw new Error(
      `The server at ${baseURL} does not see the test database global-setup just seeded ` +
        `(an authenticated page answered ${res.status}). Restart it with DATABASE_URL pointing at ${database}, or stop it.`
    );
  }
}

function storageState(token: string, expires: Date) {
  return {
    cookies: [
      {
        name: 'session',
        value: token,
        domain: 'localhost',
        path: '/',
        expires: Math.floor(expires.getTime() / 1000),
        httpOnly: true,
        secure: false, // the servers under test are http
        sameSite: 'Lax' as const,
      },
    ],
    origins: [] as unknown[],
  };
}

/** The per-role storage states and `.seed.json`. */
function writeSeedFiles({ seed, sessions }: PreparedSeed) {
  mkdirSync(authDir, { recursive: true });
  for (const [name, { token, expires }] of Object.entries(sessions)) {
    writeFileSync(path.join(authDir, `${name}.json`), JSON.stringify(storageState(token, expires), null, 2));
  }
  writeFileSync(path.join(here, '.seed.json'), JSON.stringify(seed, null, 2));
}

/**
 * The seed binds the database at import, so it is imported with the URL set
 * and the logger quiet; both are put back, since the servers and the workers
 * inherit this process's environment.
 */
async function seed(url: string): Promise<PreparedSeed> {
  const previous = { DATABASE_URL: process.env.DATABASE_URL, LOG_LEVEL: process.env.LOG_LEVEL };
  process.env.DATABASE_URL = url;
  process.env.LOG_LEVEL ??= 'error';
  try {
    const { prepareTestDatabase, closeSeedConnection } = await import('../support/seed');
    const prepared = await prepareTestDatabase();
    // Nothing may stay connected to a template that is about to be cloned.
    await closeSeedConnection();
    return prepared;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

export default async function globalSetup(config: FullConfig) {
  // The seed empties the database it runs on: baseName() refuses one whose
  // name isn't a test database's (testDb.ts).
  const url = process.env.DATABASE_URL ?? '';
  const base = baseName(url);

  // Dev mode, and a seeding script calling this without a config, share one database.
  if (!config || (process.env.E2E_SERVER ?? 'build') === 'dev') {
    const { ensureDatabase } = await import('../../src/lib/platform/dbSetup.server');
    await ensureDatabase(url);
    const prepared = await seed(url);
    writeSeedFiles(prepared);
    const baseURL = config?.projects[0]?.use.baseURL;
    if (baseURL) await assertServerSeesSeed(baseURL, prepared.sessions.admin.token, base);
    return;
  }

  // The build modes: a clone of one seeded template and a server per worker
  // (docs/guides/testing.md, "The test databases"). A taken port stops the run
  // before anything is built.
  await assertPortsFree(Array.from({ length: config.workers }, (_, slot) => workerPort(slot)));
  if (process.env.E2E_SERVER !== 'built') {
    // npm is a .cmd shim on Windows, which only a shell resolves.
    if (spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true }).status !== 0) throw new Error('The build failed.');
  }
  await sweep(url, [`${base}_e2e_`]);
  const template = templateName(base, 'e2e');
  const prepared = await seed(await createEmptyDatabase(url, template));
  writeSeedFiles(prepared);
  const databases: string[] = [];
  for (let slot = 0; slot < config.workers; slot++) databases.push(await cloneDatabase(url, template, workerName(base, slot)));

  const servers = await startWorkerServers(databases);
  try {
    for (const server of servers) await assertServerSeesSeed(server.url, prepared.sessions.admin.token, workerName(base, server.slot));
  } catch (e) {
    await Promise.all(servers.map((s) => s.stop()));
    throw e;
  }
  // Inherited by the workers, which playwright.config.ts points at their own.
  process.env.E2E_WORKER_DATABASES = JSON.stringify(databases);
  // The worker databases stay for inspecting a failure; the next sweep drops them.
  return async () => {
    await Promise.all(servers.map((s) => s.stop()));
  };
}
