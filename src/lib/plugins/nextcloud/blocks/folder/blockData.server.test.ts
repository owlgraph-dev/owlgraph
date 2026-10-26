// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startMockNextcloud, type MockFile, type MockNextcloud } from '../../e2e/mockNextcloud';
import { fakeHost } from '../../e2e/fakeHost';
import { clearListings } from '../../server/cache.server';
import { encodeSecret } from '../../server/client.server';
import type { PluginNode } from '$lib/plugins/api';
import { resolveFolderBlocks, SNAPSHOT_ROWS, type FolderBlockData } from './blockData.server';

const TOKEN = 'SnapshotShare7';
const COLLECTION = '6f1c1a52-0c5a-4b8e-9d0f-6b1f0e2a9c11';
let mock: MockNextcloud;

beforeAll(async () => {
  process.env.INTEGRATIONS_ALLOW_HTTP_LOOPBACK = '1';
  const files: Record<string, MockFile> = {};
  for (let i = 0; i < 60; i++) files[`file-${String(i).padStart(2, '0')}.txt`] = { content: `file ${i}`, mime: 'text/plain', fileid: 1000 + i };
  files['Sub/inner.txt'] = { content: 'inner', mime: 'text/plain', fileid: 2000 };
  mock = await startMockNextcloud({ [TOKEN]: { name: 'Viele', files } });
});
afterAll(() => mock.close());
beforeEach(() => {
  clearListings();
  mock.requests.length = 0;
});

const collection: PluginNode = { id: COLLECTION, type: 'collection', title: 'Viele', href: '/viele', ref: { path: '', name: 'Viele', status: 'ok', count: 61 }, file: null, content: null };

function host(readable = true) {
  return fakeHost({
    origin: mock.origin,
    nodes: {
      read: async (id) => (readable && id === COLLECTION ? collection : null),
      canWrite: async () => false,
      members: async () => [],
      observe: async () => true,
    },
    secrets: { get: async () => encodeSecret({ token: TOKEN, password: null }) },
  });
}

const block = (attrs: Record<string, unknown>) => ({ blockId: 'b1', attrs: { collectionId: COLLECTION, ...attrs } });
const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
};

describe("a folder block's data", () => {
  it('is `loading` while nothing is held — and starts the fetch for next time without waiting for it', async () => {
    const h = host();
    const first = (await resolveFolderBlocks([block({})], h)) as Record<string, FolderBlockData>;
    expect(first.b1.view?.state).toBe('loading');
    await until(() => mock.requests.some((r) => r.depth === '1'));
    expect(mock.requests.some((r) => r.depth === '1')).toBe(true);
  });

  it('is the listing held, its first rows at most, once the fetch is in', async () => {
    const h = host();
    await resolveFolderBlocks([block({})], h);
    await until(() => mock.requests.some((r) => r.depth === '1'));
    await new Promise((r) => setTimeout(r, 50));
    const held = (await resolveFolderBlocks([block({ pageSize: 200 })], h)) as Record<string, FolderBlockData>;
    expect(held.b1.view?.state).toBe('ready');
    expect(held.b1.view?.total).toBe(61);
    expect(held.b1.view?.entries).toHaveLength(SNAPSHOT_ROWS);
    // A smaller page renders no more than it holds.
    const small = (await resolveFolderBlocks([block({ pageSize: 5 })], h)) as Record<string, FolderBlockData>;
    expect(small.b1.view?.entries.map((e) => e.name)).toEqual(['Sub', 'file-00.txt', 'file-01.txt', 'file-02.txt', 'file-03.txt']);
  });

  it('says nothing of a collection the viewer may not read, and nothing for a block without one', async () => {
    const out = (await resolveFolderBlocks([block({}), { blockId: 'b2', attrs: { collectionId: null } }], host(false))) as Record<string, FolderBlockData>;
    expect(out.b1).toEqual({ view: null });
    expect(out.b2).toBeUndefined();
    expect(mock.requests).toHaveLength(0);
  });
});
