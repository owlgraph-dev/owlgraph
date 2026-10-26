// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startMockNextcloud, type MockNextcloud } from '../e2e/mockNextcloud';
import { fakeHost } from '../e2e/fakeHost';
import { clearListings, listingKey, noteShareAnswer, peekListing, readListing, shareRefused } from './cache.server';
import type { ShareSecret } from './client.server';

const TOKEN = 'CachedShare789';
const secret: ShareSecret = { token: TOKEN, password: null };
let mock: MockNextcloud;

beforeAll(async () => {
  process.env.INTEGRATIONS_ALLOW_HTTP_LOOPBACK = '1';
  mock = await startMockNextcloud({
    [TOKEN]: { name: 'Geteilt', files: { 'a.pdf': { content: 'one', mime: 'application/pdf', fileid: 1 }, 'b.txt': { content: 'two', mime: 'text/plain', fileid: 2 } } },
  });
});
afterAll(() => mock.close());
beforeEach(() => {
  clearListings();
  mock.mode = 'ok';
  mock.requests.length = 0;
  delete mock.shares.get(TOKEN)!.revoked;
});

const read = (maxAgeMs: number, now?: () => number) => readListing(fakeHost({ origin: mock.origin }), mock.origin, secret, '', maxAgeMs, now);
const depths = () => mock.requests.map((r) => r.depth);

describe('the listing cache', () => {
  it('reuses a listing for its time, without asking again', async () => {
    const first = await read(60_000);
    expect(first.ok && first.listing.entries.map((e) => e.path)).toEqual(['a.pdf', 'b.txt']);
    await read(60_000);
    expect(depths()).toEqual(['1']);
  });

  it("revalidates one past its time by its folder's etag, and reads it in full only when that changed", async () => {
    let clock = 1_000;
    const now = () => clock;
    await read(10, now);
    clock += 20;
    await read(10, now);
    expect(depths()).toEqual(['1', '0']);
    mock.shares.get(TOKEN)!.files['c.md'] = { content: 'three', mime: 'text/markdown', fileid: 3 };
    clock += 20;
    const changed = await read(10, now);
    expect(depths()).toEqual(['1', '0', '0', '1']);
    expect(changed.ok && changed.listing.entries.map((e) => e.path)).toEqual(['a.pdf', 'b.txt', 'c.md']);
    delete mock.shares.get(TOKEN)!.files['c.md'];
  });

  it('shares one fetch between readers asking at once', async () => {
    const [a, b, c] = await Promise.all([read(0), read(0), read(0)]);
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, true]);
    expect(depths()).toEqual(['1']);
  });

  it('keeps the last listing when the server fails, to be shown as stale', async () => {
    await read(0);
    mock.mode = 'error';
    const failed = await read(0);
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.problem).toBe('unreachable');
      expect(failed.stale?.entries).toHaveLength(2);
    }
  });

  it('keys a listing by server and the whole credential — never by the credential itself', async () => {
    await read(60_000);
    expect(peekListing(mock.origin, secret, '')).not.toBeNull();
    expect(peekListing('https://other.example', secret, '')).toBeNull();
    expect(peekListing(mock.origin, { token: 'AnotherShare1', password: null }, '')).toBeNull();
    // Another password is another share to the cache.
    expect(peekListing(mock.origin, { token: TOKEN, password: 'other' }, '')).toBeNull();
    expect(peekListing(mock.origin, secret, 'Sub')).toBeNull();
    const key = listingKey(mock.origin, { token: TOKEN, password: 'hush' }, '');
    expect(key).not.toContain(TOKEN);
    expect(key).not.toContain('hush');
  });

  it("forgets a share's listings when Nextcloud refuses it, and shows nothing of it as stale", async () => {
    await read(0);
    expect(peekListing(mock.origin, secret, '')).not.toBeNull();
    mock.shares.get(TOKEN)!.revoked = true;
    const refused = await read(0);
    expect(refused).toEqual({ ok: false, problem: 'revoked', stale: null });
    expect(peekListing(mock.origin, secret, '')).toBeNull();
  });

  it('asks a refused share again only once its wait is over, waiting longer each time, and at once when it reads again', async () => {
    let clock = 1_000_000;
    const now = () => clock;
    const wait = 60_000;
    const readAt = () => readListing(fakeHost({ origin: mock.origin }), mock.origin, secret, '', 0, now, wait);
    mock.shares.get(TOKEN)!.revoked = true;
    expect((await readAt()).ok).toBe(false);
    const asked = mock.requests.length;
    clock += 30_000;
    expect(await readAt()).toEqual({ ok: false, problem: 'revoked', stale: null });
    expect(mock.requests.length).toBe(asked);
    clock += 31_000;
    expect((await readAt()).ok).toBe(false);
    expect(mock.requests.length).toBeGreaterThan(asked);
    // Refused twice in a row: twice the wait.
    clock += 90_000;
    expect(shareRefused(mock.origin, secret, wait, clock)).toBe('revoked');
    clock += 31_000;
    expect(shareRefused(mock.origin, secret, wait, clock)).toBeNull();
    // Anything readable ends the wait; with no cache time nothing waits.
    noteShareAnswer(mock.origin, secret, 'unauthorized', clock);
    expect(shareRefused(mock.origin, secret, wait, clock)).toBe('unauthorized');
    expect(shareRefused(mock.origin, secret, 0, clock)).toBeNull();
    noteShareAnswer(mock.origin, secret, null, clock);
    expect(shareRefused(mock.origin, secret, wait, clock)).toBeNull();
    // Another credential for the same share is asked at once.
    noteShareAnswer(mock.origin, secret, 'unauthorized', clock);
    expect(shareRefused(mock.origin, { token: TOKEN, password: 'new' }, wait, clock)).toBeNull();
  });
});
