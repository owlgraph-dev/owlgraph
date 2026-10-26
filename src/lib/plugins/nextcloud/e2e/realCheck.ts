// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Checks the plugin against a real Nextcloud by hand, with a test account:
// what the mock cannot prove. The suites never run it.
//
//   npx tsx --tsconfig tsconfig.tsx.json src/lib/plugins/nextcloud/e2e/realCheck.ts \
//     https://cloud.example.org [--folder <path>] [--file <path>] [--fileid <id of a file shared with the account>]
//
// Once approved, the app password is revoked whatever happens next (a failed
// step, Ctrl+C), or the script says to remove it by hand. Neither it nor the
// login name is ever printed.
import { READ_METHODS, loopbackHttpAllowed, parseUpstreamOrigin, upstreamClient } from '$lib/platform/upstream.server';
import type { PluginCredential, PluginOpenConnection } from '$lib/plugins/api';
import { connectFlow } from '../server/connect.server';
import { propfind, searchById, streamFile, userAccess } from '../server/client.server';
import { fakeHost } from './fakeHost';

const APP_PASSWORD_NAME = 'owlgraph (real check)';

function argument(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : null;
}

class CheckFailed extends Error {}

const step = (text: string) => console.log(`\n▸ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
function fail(text: string): never {
  throw new CheckFailed(text);
}

// Plain http only to a loopback host with INTEGRATIONS_ALLOW_HTTP_LOOPBACK=1: a dry run against the mock.
const parsed = parseUpstreamOrigin(process.argv[2] ?? '', { allowLoopbackHttp: loopbackHttpAllowed() });
if (!('origin' in parsed)) {
  console.log(`  ✘ Give the Nextcloud address as the first argument, such as https://cloud.example.org (${'problem' in parsed ? parsed.problem : 'missing'})`);
  process.exit(1);
}
const origin = (parsed as { origin: string }).origin;
const folder = argument('folder') ?? '';
const filePath = argument('file');
const sharedFileid = argument('fileid');
const flowClient = upstreamClient(origin, {}, { methods: [...READ_METHODS, 'POST', 'DELETE'] });
let refusals = 0;
const host = fakeHost({
  origin,
  cacheSeconds: 0,
  connection: {
    refused: async () => {
      refusals++;
    },
  },
});

// From approval until Nextcloud forgets it.
let held: PluginCredential | null = null;

/** Revokes a still-held app password, or says how to remove it by hand. */
async function cleanUp(): Promise<void> {
  const credential = held;
  if (!credential) return;
  held = null;
  const forgotten = await connectFlow.revoke(flowClient, credential).catch(() => false);
  console.log(
    forgotten
      ? '  (the app password was removed again)'
      : `  ! The app password could not be removed: delete "${APP_PASSWORD_NAME}" under Personal settings → Security → Devices & sessions.`
  );
}

process.on('SIGINT', () => {
  console.log('\n  Interrupted.');
  void cleanUp().finally(() => process.exit(130));
});

async function main(): Promise<void> {
  step(`Login Flow v2 at ${origin}`);
  const begun = await connectFlow.begin(flowClient, { clientName: APP_PASSWORD_NAME });
  if (!begun.ok) fail(`Nextcloud did not begin a flow: ${begun.reason}`);
  const approve = new URL(new URL(begun.approveUrl).pathname + new URL(begun.approveUrl).search, origin).toString();
  console.log(`  Open this address in a browser, sign in as the test account and grant access:\n\n    ${approve}\n`);

  const deadline = Date.now() + 10 * 60_000;
  while (!held && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const polled = await connectFlow.poll(flowClient, begun.handle);
    if (polled.state === 'approved') {
      held = polled.credential;
      const server = new URL(polled.server);
      if (server.host !== new URL(origin).host || (server.pathname !== '/' && server.pathname !== '')) fail(`Nextcloud named another server (${server.host}${server.pathname}) than ${origin}`);
      ok(`approved; Nextcloud names ${server.protocol}//${server.host} as itself`);
    } else if (polled.state === 'gone' || polled.state === 'failed') {
      console.log(`  (poll: ${polled.state} — asking again)`);
    }
  }
  const credential = held as PluginCredential | null;
  if (!credential) fail('Not approved within ten minutes.');

  step('Who the app password is');
  const verified = await connectFlow.verify(flowClient, credential);
  if (!verified.ok) fail(`Nextcloud refused the new app password: ${verified.reason}`);
  ok(`account id ${verified.accountId}, shown as "${verified.accountLabel}"`);

  const connection: PluginOpenConnection = { id: 'real-check', accountId: verified.accountId, accountLabel: verified.accountLabel, credential };
  const own = userAccess(connection);
  if (!own) fail(`The account id "${verified.accountId}" cannot name a WebDAV root.`);

  step(`PROPFIND, Depth 1: ${folder || '(the account root)'}`);
  const listed = await propfind(host, own, folder, 1, 'real-check:list');
  if (!listed.ok) fail(`could not list it: ${listed.problem}`);
  for (const e of listed.entries.slice(0, 25)) console.log(`    ${e.folder ? '📁' : '  '} ${e.path || '(root)'}  id ${e.fileid ?? '?'}${e.folder ? '' : `, ${e.size ?? '?'} bytes`}`);
  ok(`${listed.entries.length - 1} entries`);

  let sharedPath: string | null = null;
  if (sharedFileid) {
    step(`SEARCH the account's files for file id ${sharedFileid}`);
    const found = await searchById(host, own, sharedFileid, 'real-check:search');
    if (!found.ok) fail(`SEARCH failed: ${found.problem}`);
    const hits = found.entries.filter((e) => e.fileid === sharedFileid);
    if (hits.length === 0) fail('not found — is it shared with the account?');
    for (const hit of hits) ok(`found at ${hit.path}`);
    sharedPath = hits.find((hit) => !hit.folder)?.path ?? null;
  }

  // The file named, else the one searched for, else the folder's first.
  const target = filePath ?? sharedPath ?? listed.entries.find((e) => !e.folder)?.path ?? null;
  if (target) {
    step(`GET ${target}`);
    const file = await streamFile(host, own, target, 'real-check:get');
    if (!file.ok) fail(`could not read it: ${file.problem}`);
    const body = new Uint8Array(await new Response(file.body).arrayBuffer());
    ok(`${body.byteLength} bytes`);
  } else {
    step('GET — skipped: no file in the folder listed (give one with --file)');
  }

  step('Nextcloud forgets the app password');
  held = null;
  if (!(await connectFlow.revoke(flowClient, credential))) {
    held = credential;
    fail('the DELETE was not accepted');
  }
  ok('forgotten');

  step('The forgotten app password is refused');
  const again = await connectFlow.verify(flowClient, credential);
  if (again.ok) fail('Nextcloud still accepts it');
  if (again.reason !== 'unauthorized') fail(`expected a refusal, got: ${again.reason}`);
  ok('refused');
}

let code = 0;
try {
  await main();
  console.log(`\nAll checks passed. Refusals reported during the reads: ${refusals}.`);
} catch (error) {
  code = 1;
  // Only a check's own words: an error's message could quote what it read.
  console.log(`  ✘ ${error instanceof CheckFailed ? error.message : `stopped by an unexpected ${error instanceof Error ? error.name : typeof error}`}`);
} finally {
  await cleanUp();
}
process.exit(code);
