// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Through the real pinned client, so the deadline is its own
// (DEFAULT_UPSTREAM_LIMITS.totalTimeoutMs); only the clock is fake. Fake timers
// don't reach AbortSignal.timeout, so `fakeClock` runs it on the fake setTimeout.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_UPSTREAM_LIMITS } from '$lib/platform/upstream.server';
import type { PluginNode } from '$lib/plugins/api';
import { startMockNextcloud, type MockNextcloud } from '../e2e/mockNextcloud';
import { fakeHost } from '../e2e/fakeHost';
import { resolveFolderBlocks, type FolderBlockData } from '../blocks/folder/blockData.server';
import { clearListings } from './cache.server';
import { encodeSecret, propfind, shareAccess, type ShareSecret } from './client.server';
import { listingOf, listingQuery } from './listing.server';

const TOKEN = 'SlowShare42';
const COLLECTION = '0b6f3c1e-7d2a-4c59-9e81-3f4a5b6c7d8e';
const DEADLINE = DEFAULT_UPSTREAM_LIMITS.totalTimeoutMs;
const secret: ShareSecret = { token: TOKEN, password: null };
let mock: MockNextcloud;

beforeAll(async () => {
  process.env.INTEGRATIONS_ALLOW_HTTP_LOOPBACK = '1';
  mock = await startMockNextcloud({
    [TOKEN]: { name: 'Langsam', files: { 'a.pdf': { content: 'one', mime: 'application/pdf', fileid: 1 }, 'b.txt': { content: 'two', mime: 'text/plain', fileid: 2 } } },
  });
});
afterAll(() => mock.close());
beforeEach(() => {
  clearListings();
  mock.mode = 'ok';
  mock.delayMs = 0;
  mock.requests.length = 0;
});
afterEach(async () => {
  if (vi.isFakeTimers()) {
    // Play out every held answer and running deadline: no request outlives its test.
    await vi.advanceTimersByTimeAsync(DEADLINE * 3);
    vi.useRealTimers();
  }
  vi.restoreAllMocks();
  mock.delayMs = 0;
});

const collection: PluginNode = { id: COLLECTION, type: 'collection', title: 'Langsam', href: '/langsam', ref: { path: '', name: 'Langsam', status: 'ok', count: 2 }, file: null, content: null };

/** No cache time: every listing asks the server. */
function host(writer: boolean) {
  return fakeHost({
    origin: mock.origin,
    cacheSeconds: 0,
    nodes: {
      read: async (id) => (id === COLLECTION ? collection : null),
      canWrite: async () => writer,
      members: async () => [],
      observe: async () => true,
    },
    secrets: { get: async () => encodeSecret(secret) },
  });
}

function fakeClock() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), ms);
    return controller.signal;
  });
}

/** Waits on the event loop's turns, not the fake clock: the requests are loopback I/O. */
async function received(count: number) {
  const until = Date.now() + 5_000;
  while (mock.requests.length < count && Date.now() < until) await new Promise((resolve) => setImmediate(resolve));
  expect(mock.requests.length).toBeGreaterThanOrEqual(count);
}

/** 'waiting' when the promise hasn't settled by the event loop's next turn. */
async function atOnce<T>(promise: Promise<T>): Promise<T | 'waiting'> {
  return Promise.race([promise, new Promise<'waiting'>((resolve) => setImmediate(() => resolve('waiting')))]);
}

const root = listingQuery(new URLSearchParams())!;

describe('a Nextcloud slower than the client’s deadline', () => {
  it('is read as unreachable, logged as a timeout — and one that answers within the deadline is read', async () => {
    const h = host(true);
    fakeClock();

    mock.delayMs = DEADLINE - 1_000;
    const within = propfind(h, shareAccess(secret), '', 1, 'test:within');
    await received(1);
    await vi.advanceTimersByTimeAsync(DEADLINE - 1_000);
    const read = await within;
    expect(read.ok && read.entries.map((e) => e.path)).toEqual(['', 'a.pdf', 'b.txt']);

    mock.delayMs = DEADLINE + 1_000;
    const late = propfind(h, shareAccess(secret), '', 1, 'test:late');
    await received(2);
    await vi.advanceTimersByTimeAsync(DEADLINE);
    expect(await late).toEqual({ ok: false, problem: 'unreachable' });
    expect(h.logs.upstreamFailed).toEqual([expect.objectContaining({ operation: 'test:late', failure: 'timeout' })]);
    expect(JSON.stringify(h.logs)).not.toContain(TOKEN);
  });

  it("is named unreachable in a writer's listing — unavailable with nothing held, the listing held shown as stale — and a reader is told no reason", async () => {
    fakeClock();
    mock.delayMs = DEADLINE + 1_000;
    const none = listingOf(host(true), collection, root, { network: true });
    await received(1);
    await vi.advanceTimersByTimeAsync(DEADLINE);
    expect(await none).toMatchObject({ state: 'unavailable', reason: 'unreachable', entries: [] });
    await vi.advanceTimersByTimeAsync(DEADLINE * 3);
    vi.useRealTimers();
    vi.restoreAllMocks();

    mock.delayMs = 0;
    expect((await listingOf(host(true), collection, root, { network: true })).state).toBe('ready');
    const asked = mock.requests.length;

    fakeClock();
    mock.delayMs = DEADLINE + 1_000;
    const writer = listingOf(host(true), collection, root, { network: true });
    await received(asked + 1);
    await vi.advanceTimersByTimeAsync(DEADLINE);
    const stale = await writer;
    expect(stale).toMatchObject({ state: 'stale', reason: 'unreachable', total: 2 });
    expect(stale.entries.map((e) => e.name)).toEqual(['a.pdf', 'b.txt']);

    const reader = listingOf(host(false), collection, root, { network: true });
    await received(asked + 2);
    await vi.advanceTimersByTimeAsync(DEADLINE);
    const seen = await reader;
    expect(seen.state).toBe('stale');
    expect(seen.reason).toBeUndefined();
    expect(seen.entries.map((e) => e.name)).toEqual(['a.pdf', 'b.txt']);
  });

  it('keeps a page from waiting on it: the folder block’s data is loading, or the listing held, at once — its fetch for next time left to the server’s pace', async () => {
    const block = { blockId: 'b1', attrs: { collectionId: COLLECTION } };
    fakeClock();
    mock.delayMs = DEADLINE + 1_000;
    const cold = await atOnce(resolveFolderBlocks([block], host(false)));
    expect(cold === 'waiting' ? cold : (cold as Record<string, FolderBlockData>).b1.view?.state).toBe('loading');
    // The fetch for next time went out and waits on the server, not the page.
    await received(1);
    await vi.advanceTimersByTimeAsync(DEADLINE * 3);
    vi.useRealTimers();
    vi.restoreAllMocks();

    mock.delayMs = 0;
    expect((await listingOf(host(false), collection, root, { network: true })).state).toBe('ready');
    const asked = mock.requests.length;

    fakeClock();
    mock.delayMs = DEADLINE + 1_000;
    const held = await atOnce(resolveFolderBlocks([block], host(false)));
    expect(held).not.toBe('waiting');
    const view = (held as Record<string, FolderBlockData>).b1.view;
    expect(view?.state).toBe('ready');
    expect(view?.entries.map((e) => e.name)).toEqual(['a.pdf', 'b.txt']);
    // Past its cache time (none), its fetch for next time went out too.
    await received(asked + 1);
  });
});
