// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startMockNextcloud, type MockNextcloud } from '../e2e/mockNextcloud';
import { fakeHost } from '../e2e/fakeHost';
import { encodeSecret } from './client.server';
import { clearListings, readListing } from './cache.server';
import { clearLocations } from './locations.server';
import { collectionNodeView, type CollectionBodyData } from './nodeView.server';
import type { PluginNode, PluginOpenConnection } from '$lib/plugins/api';

const SHARE = 'NodeViewShare77';
let mock: MockNextcloud;

beforeAll(async () => {
  process.env.INTEGRATIONS_ALLOW_HTTP_LOOPBACK = '1';
  mock = await startMockNextcloud({ [SHARE]: { name: 'Team', files: { 'a.txt': { content: 'A', mime: 'text/plain', fileid: 501 }, 'b.txt': { content: 'B', mime: 'text/plain', fileid: 502 } }, folderIds: { '': 500 } } });
});
afterAll(() => mock.close());
beforeEach(() => {
  clearListings();
  clearLocations();
});

const alice: PluginOpenConnection = { id: 'connection-alice', accountId: 'alice', accountLabel: 'Alice Example', credential: { kind: 'app_password', login: 'alice', secret: 'pw-alice' } };

function hostFor(opts: { enabled?: boolean; share?: boolean; connection?: 'none' | 'active' | 'renew' }) {
  const status = opts.connection ?? 'none';
  return fakeHost({
    origin: mock.origin,
    enabled: opts.enabled,
    viewerId: status === 'none' ? null : 'viewer-1',
    cacheSeconds: 60,
    secrets: { get: async () => (opts.share ? encodeSecret({ token: SHARE, password: null }) : null) },
    connection: { status: async () => status, open: async () => (status === 'active' ? alice : null), href: () => '/settings/connections' },
    nodes: { canWrite: async () => false, members: async () => [] },
  });
}

const collection = (ref: Record<string, unknown>): PluginNode => ({ id: '6f1c1a52-0c5a-4b8e-9d0f-6b1f0e2a9c11', type: 'collection', title: 'Team', href: '/team', ref, file: null, content: null });

describe("a collection's own page", () => {
  it('shows nothing of its own while the integration is turned off', async () => {
    expect(await collectionNodeView(collection({ path: '', name: 'Team', fileid: '500' }), { canWrite: false }, hostFor({ enabled: false, share: true }))).toBeNull();
  });

  it('starts from the listing held for its share, or loading, and never waits on Nextcloud for it', async () => {
    const node = collection({ path: '', name: 'Team', fileid: '500' });
    const cold = await collectionNodeView(node, { canWrite: false }, hostFor({ share: true }));
    expect((cold?.data as CollectionBodyData).view.state).toBe('loading');
    expect(cold?.detail).toBeNull();

    const host = hostFor({ share: true });
    await readListing(host, mock.origin, { token: SHARE, password: null }, '', 0);
    const held = await collectionNodeView(node, { canWrite: false }, host);
    const data = held?.data as CollectionBodyData;
    expect(data.view.state).toBe('ready');
    expect(data.view.entries.map((e) => e.name)).toEqual(['a.txt', 'b.txt']);
    expect(held?.detail).toBe('2 entries');
    expect(JSON.stringify(held)).not.toContain(SHARE);
  });

  it('says how it can be read: through its share, through the files of whoever connects, or both', async () => {
    const shareOnly = await collectionNodeView(collection({ path: '', name: 'Team' }), { canWrite: false }, hostFor({ share: true }));
    expect(shareOnly?.readsVia).toBe('Share');
    const both = await collectionNodeView(collection({ path: '', name: 'Team', fileid: '500' }), { canWrite: false }, hostFor({ share: true }));
    expect(both?.readsVia).toBe('Share + own files');
    const own = await collectionNodeView(collection({ name: 'Team', fileid: '500' }), { canWrite: false }, hostFor({ connection: 'active' }));
    expect(own?.readsVia).toBe('Own files');
  });

  it('offers the folder in Nextcloud to a viewer with an active connection alone, and names whom they read as', async () => {
    const node = collection({ path: '', name: 'Team', fileid: '500' });
    const connected = await collectionNodeView(node, { canWrite: false }, hostFor({ share: true, connection: 'active' }));
    expect(connected?.actions).toEqual([{ id: 'open', label: 'Open in Nextcloud', href: `${mock.origin}/index.php/f/500`, external: true }]);
    expect((connected?.data as CollectionBodyData).readAs).toBe('Alice Example');

    for (const connection of ['none', 'renew'] as const) {
      const other = await collectionNodeView(node, { canWrite: false }, hostFor({ share: true, connection }));
      expect(other?.actions, connection).toEqual([]);
      expect((other?.data as CollectionBodyData).readAs, connection).toBeNull();
    }
    // Without the folder's id there is nothing to open.
    const unknown = await collectionNodeView(collection({ path: '', name: 'Team' }), { canWrite: false }, hostFor({ share: true, connection: 'active' }));
    expect(unknown?.actions).toEqual([]);
  });
});
