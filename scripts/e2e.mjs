// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The e2e runner behind `npm run test:e2e` and `npm run gate` (docs/guides/testing.md,
// "Lanes"): one build, then each lane as its own Playwright run. Every lane
// runs even after one failed, so a red lane never hides the next.
//
//   node scripts/e2e.mjs [lane…] [--skip-build] [-- <playwright args>]
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';

const LANES = {
  app: { project: 'app', env: {} },
  branded: { project: 'branded-accent', env: { E2E_BRANDED_ACCENT: '1' } },
};

const argv = process.argv.slice(2);
const split = argv.indexOf('--');
const own = split === -1 ? argv : argv.slice(0, split);
const passthrough = split === -1 ? [] : argv.slice(split + 1);
const skipBuild = own.includes('--skip-build');
const requested = own.filter((a) => !a.startsWith('--'));
const unknown = requested.filter((l) => !(l in LANES));

if (unknown.length) {
  console.error(`Unknown lane: ${unknown.join(', ')}. Lanes: ${Object.keys(LANES).join(', ')}.`);
  process.exit(2);
}
if (process.env.E2E_SERVER === 'dev') {
  console.error('The e2e runner tests the production build; unset E2E_SERVER (dev mode is for single specs: docs/guides/testing.md).');
  process.exit(2);
}

// The database server first: down, every lane would wait out the web server's
// health check before failing. A missing database is fine: global-setup creates it.
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://user:password@localhost:5432/owlgraph_test';
const probe = postgres(databaseUrl, { max: 1, connect_timeout: 5, onnotice: () => {} });
try {
  await probe`select 1`;
} catch (e) {
  if (e?.code !== '3D000') {
    console.error(`The test database server is unreachable (${databaseUrl.replace(/\/\/[^@]*@/, '//')}): ${e?.code || e?.message || e}`);
    process.exit(1);
  }
} finally {
  await probe.end({ timeout: 1 });
}

// npm and npx are .cmd shims on Windows, which only a shell resolves.
const run = (cmd, args, env = {}) => spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } }).status ?? 1;

if (!skipBuild && run('npm', ['run', 'build']) !== 0) {
  console.error('\nThe build failed; no lane ran.');
  process.exit(1);
}

const results = [];
for (const lane of requested.length ? requested : Object.keys(LANES)) {
  const { project, env } = LANES[lane];
  console.log(`\n── e2e lane: ${lane} ──`);
  const started = Date.now();
  // A run clears its output folder, so a shared one would lose the earlier lane's failures.
  const status = run('npx', ['playwright', 'test', `--project=${project}`, `--output=test-results/${lane}`, ...passthrough], {
    ...env,
    E2E_SERVER: 'built',
    PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/${lane}`,
  });
  results.push({ lane, ok: status === 0, seconds: Math.round((Date.now() - started) / 1000) });
}

console.log('\n── e2e summary ──');
for (const r of results) console.log(`  ${r.ok ? 'passed' : 'FAILED'}  ${r.lane.padEnd(8)} ${r.seconds}s`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
