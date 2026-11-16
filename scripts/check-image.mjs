// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Starts the compose stack from an image, through docker-compose.image.yml, and
// requires it to work: the check .github/workflows/image.yml runs on a pull
// request and before a release publishes (docs/guides/testing.md, "CI contract").
// `migrate` exits 0, `app` and `mcp` become healthy and answer, the About page
// names the version and links the source, the licence texts are there, the
// first admin can be created and can sign in, and the native modules load.
//
//   node scripts/check-image.mjs <image> [--version <v>] [--revision <rev>] [--source <url>]
//   node scripts/check-image.mjs <image> --modules-only [--platform <os/arch>]
//
// --version defaults to package.json's, --revision to `dev` and --source to the
// upstream repository: what the image was built with. The stack runs under a
// project name of its own, on free ports, with passwords made for the run, and
// never reads .env; it is removed with its volume afterwards, so nothing else
// on the machine is touched. --modules-only only loads the native modules,
// for another platform under emulation.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'owlgraph-image-check';

const argv = process.argv.slice(2);
/** @param {string} name */
const option = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const image = argv[0];
if (!image || image.startsWith('--')) {
  console.error('Usage: node scripts/check-image.mjs <image> [--version <v>] [--revision <rev>] [--source <url>] | --modules-only [--platform <os/arch>]');
  process.exit(2);
}

/**
 * Runs docker; its output is shown unless `capture`, and a non-zero exit throws.
 * @param {string[]} args
 * @param {{ capture?: boolean, input?: string, env?: NodeJS.ProcessEnv }} [options]
 */
function docker(args, { capture = false, input, env = process.env } = {}) {
  const run = spawnSync('docker', args, {
    cwd: ROOT,
    env,
    input,
    encoding: 'utf8',
    stdio: [input === undefined ? 'ignore' : 'pipe', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'],
  });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`docker ${args.slice(0, 4).join(' ')} … exited ${run.status}${capture ? `:\n${run.stderr || run.stdout}` : ''}`);
  return run.stdout ?? '';
}

let failed = false;
/** @param {string} what @param {() => unknown} check */
async function step(what, check) {
  try {
    const detail = await check();
    console.log(`  ✓ ${what}${typeof detail === 'string' ? ` — ${detail}` : ''}`);
  } catch (e) {
    failed = true;
    console.log(`  ✗ ${what}: ${e instanceof Error ? e.message : e}`);
  }
}

/** @param {unknown} condition @param {string} message */
function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

// The image's platform-specific dependencies, which install without their
// install scripts (Dockerfile, the runtime stage): sharp writes images, esbuild
// runs tsx (migrate, mcp and the scripts). sharp must load its native binding
// for the image's platform: without one it falls back to its WebAssembly build,
// which works, slowly.
const MODULES = `
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const sharp = require('sharp');
const binding = Object.keys(require.cache).find((path) => path.includes('@img') && (path.endsWith('.node') || path.endsWith('.node.js')));
if (!binding || !binding.includes('sharp-linux-' + process.arch)) throw new Error('sharp loaded ' + binding + ', not its binding for linux-' + process.arch);
const webp = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#808080' } }).webp().toBuffer();
if ((await sharp(webp).metadata()).format !== 'webp') throw new Error('sharp did not write a WebP');
const esbuild = await import('esbuild');
const { code } = await esbuild.transform('const n: number = 1;', { loader: 'ts' });
if (!code.includes('const n = 1')) throw new Error('esbuild did not compile TypeScript');
console.log(process.arch + ': sharp on libvips ' + sharp.versions.vips + ', esbuild ' + esbuild.version);
`;

/** @param {string} [platform] */
const modules = (platform) =>
  docker(['run', '--rm', ...(platform ? ['--platform', platform] : []), image, 'node', '--input-type=module', '-e', MODULES], { capture: true }).trim();

if (argv.includes('--modules-only')) {
  const platform = option('--platform');
  console.log(`Checking ${image}${platform ? ` for ${platform}` : ''}:`);
  await step('the native modules load', () => modules(platform));
  process.exit(failed ? 1 : 0);
}

const version = option('--version') ?? JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const revision = option('--revision') ?? 'dev';
const source = (option('--source') ?? 'https://github.com/owlgraph-dev/owlgraph').replace(/\/+$/, '');
const sourceHref = revision === 'dev' ? source : `${source}/tree/${revision}`;

/** A free port on this machine. @returns {Promise<number>} */
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer().once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => (address && typeof address === 'object' ? resolve(address.port) : reject(new Error('no port'))));
    });
  });
const appPort = await freePort();
const mcpPort = await freePort();
const secret = () => randomBytes(16).toString('hex');
const adminPassword = secret();

// Every value compose interpolates comes from this file. Variables of the same
// names in this process's environment would win over it, so the docker
// processes get the environment without them.
const dir = mkdtempSync(join(tmpdir(), `${PROJECT}-`));
const envFile = join(dir, '.env');
writeFileSync(
  envFile,
  [
    `OWLGRAPH_IMAGE=${image}`,
    `CONTAINER_PREFIX=${PROJECT}`,
    'POSTGRES_USER=owlgraph',
    'POSTGRES_DB=owlgraph',
    `POSTGRES_PASSWORD=${secret()}`,
    `APP_DB_PASSWORD=${secret()}`,
    `APP_PORT=${appPort}`,
    `MCP_PORT=${mcpPort}`,
    `ORIGIN=http://localhost:${appPort}`,
    '',
  ].join('\n')
);
const INTERPOLATED = /^(COMPOSE_|POSTGRES_|APP_|MCP_|OWLGRAPH_|SOURCE_|ORIGIN$|CONTAINER_PREFIX$|BODY_SIZE_LIMIT$|ADDRESS_HEADER$|XFF_DEPTH$|LOG_LEVEL$|DB_POOL_MAX$)/;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !INTERPOLATED.test(key)));
const compose = (/** @type {string[]} */ args, /** @type {{ capture?: boolean, input?: string }} */ options = {}) =>
  docker(
    ['compose', '--project-name', PROJECT, '--env-file', envFile, '-f', join(ROOT, 'docker-compose.yml'), '-f', join(ROOT, 'docker-compose.image.yml'), ...args],
    { ...options, env }
  );

const APP = `http://127.0.0.1:${appPort}`;
const MCP = `http://127.0.0.1:${mcpPort}`;
/** @param {string} url @param {RequestInit} [init] */
const get = (url, init = {}) => fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), ...init });

console.log(`Checking ${image}: version ${version}, source ${sourceHref}`);
try {
  let up = true;
  try {
    compose(['up', '--detach', '--wait', '--wait-timeout', '300', 'app', 'mcp']);
  } catch (e) {
    up = false;
    failed = true;
    console.log(`  ✗ the stack comes up: ${e instanceof Error ? e.message : e}`);
  }
  await step('migrate exited 0', () => {
    const code = docker(['inspect', '--format', '{{.State.Status}} {{.State.ExitCode}}', `${PROJECT}-migrate`], { capture: true }).trim();
    ensure(code === 'exited 0', `migrate is ${code}`);
  });

  if (up) {
    await step('app and mcp are healthy', async () => {
      const app = await get(`${APP}/api/health`);
      ensure(app.ok, `app's /api/health answered ${app.status}`);
      const mcp = await get(`${MCP}/health`);
      ensure(mcp.ok, `mcp's /health answered ${mcp.status}`);
    });

    await step('the About page names the version and links its source', async () => {
      const res = await get(`${APP}/-/about`);
      ensure(res.ok, `/-/about answered ${res.status}`);
      const html = await res.text();
      ensure(html.includes(version), `it does not name version ${version}`);
      ensure(html.includes(`href="${sourceHref}"`), `it does not link ${sourceHref}`);
      return sourceHref;
    });

    await step('the licence, the plugin exception and the third-party notices are there', async () => {
      const license = await get(`${APP}/-/license`);
      const text = license.ok ? await license.text() : '';
      ensure(text.includes('GNU AFFERO GENERAL PUBLIC LICENSE'), `/-/license answered ${license.status} without the AGPL`);
      ensure(text.includes('Plugin Exception'), '/-/license lacks the plugin exception');
      const notices = await get(`${APP}/licenses.txt`);
      ensure(notices.ok && (await notices.text()).startsWith('owlgraph — third-party licences'), `/licenses.txt answered ${notices.status}`);
      compose(['exec', '-T', 'app', 'sh', '-c', 'test -s LICENSE && test -s PLUGIN-EXCEPTION.md && test -s THIRD-PARTY-NOTICES.md'], { capture: true });
    });

    await step('the first admin is created and signs in', async () => {
      const email = 'admin@example.com';
      compose(['exec', '-T', 'app', 'npx', 'tsx', '--tsconfig', 'tsconfig.tsx.json', 'scripts/create-admin.ts', email, 'Image check'], {
        capture: true,
        input: adminPassword,
      });
      const signIn = await get(`${APP}/login`, {
        method: 'POST',
        headers: { origin: `http://localhost:${appPort}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email, password: adminPassword }),
      });
      const session = /(?:^|[,\s])session=([^;]+)/.exec(signIn.headers.get('set-cookie') ?? '')?.[1];
      ensure(session, `signing in answered ${signIn.status} without a session`);
      // An admin's page, which a visitor is refused.
      const visitor = await get(`${APP}/settings/users`);
      ensure(visitor.status !== 200, 'the user settings answered 200 to a visitor');
      const admin = await get(`${APP}/settings/users`, { headers: { cookie: `session=${session}` } });
      ensure(admin.status === 200, `the user settings answered ${admin.status} to the admin`);
    });
  }

  await step('the native modules load', () => modules());
} finally {
  if (failed) {
    console.log('\nThe services’ logs:');
    try {
      compose(['logs', '--no-color', '--tail', '150']);
    } catch {
      // The stack may never have started.
    }
  }
  try {
    compose(['down', '--volumes', '--remove-orphans'], { capture: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(failed ? '\nThe image failed its check.' : '\nThe image passed its check.');
process.exit(failed ? 1 : 0);
