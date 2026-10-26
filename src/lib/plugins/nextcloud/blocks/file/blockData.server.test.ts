// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { fakeHost } from '../../e2e/fakeHost';
import type { PluginNode } from '$lib/plugins/api';
import { resolveFileBlocks, type FileBlockData } from './blockData.server';

const DOC = '2b4f0c1e-6d3a-4c59-9e1a-7f0b3c2d1e44';
const COLLECTION = '6f1c1a52-0c5a-4b8e-9d0f-6b1f0e2a9c11';

const collection: PluginNode = {
  id: COLLECTION,
  type: 'collection',
  title: 'Unterlagen',
  href: '/unterlagen',
  ref: { path: '', name: 'Projektunterlagen', status: 'ok', count: 3 },
  file: null,
  content: null,
};
const document: PluginNode = {
  id: DOC,
  type: 'document',
  title: 'Quartalsbericht',
  href: '/quartalsbericht',
  ref: { path: '2026 Q3/Bericht.pdf', fileid: '48213', etag: '"e1"', modified: '2026-10-02T09:30:00.000Z', status: 'ok', checkedAt: '2026-10-09T10:00:00.000Z', seenAt: '2026-10-09T10:00:00.000Z', collectionId: COLLECTION },
  file: { filename: 'Bericht.pdf', mime: 'application/pdf', size: 1234 },
  content: { view: `/api/documents/${DOC}/content`, download: `/api/documents/${DOC}/content?download` },
};

// No server is set: a resolver that asked Nextcloud would find no client.
const host = (readable: string[]) =>
  fakeHost({ origin: null, nodes: { read: async (id) => (readable.includes(id) ? ({ [DOC]: document, [COLLECTION]: collection } as Record<string, PluginNode>)[id] : null) } });

const resolve = async (blocks: { blockId: string; attrs: Record<string, unknown> }[], readable: string[], enabled = true) =>
  (await resolveFileBlocks(blocks, enabled ? host(readable) : fakeHost({ origin: null, enabled: false, nodes: { read: async () => document } }))) as Record<string, FileBlockData>;

describe("a file block's data", () => {
  it('is its document as last recorded, and where its file is in the share', async () => {
    const out = await resolve([{ blockId: 'b1', attrs: { documentId: DOC } }], [DOC, COLLECTION]);
    expect(out.b1.view).toMatchObject({
      id: DOC,
      title: 'Quartalsbericht',
      status: 'ok',
      fileid: '48213',
      seenAt: '2026-10-09T10:00:00.000Z',
      collectionId: COLLECTION,
      location: { collection: 'Projektunterlagen', folder: '2026 Q3' },
      content: { view: `/api/documents/${DOC}/content` },
    });
  });

  it('leaves out where it is when the viewer may not read its collection', async () => {
    const out = await resolve([{ blockId: 'b1', attrs: { documentId: DOC } }], [DOC]);
    expect(out.b1.view?.location).toBeNull();
  });

  it('says nothing of a document the viewer may not read, and nothing for a block without one', async () => {
    const out = await resolve([{ blockId: 'b1', attrs: { documentId: DOC } }, { blockId: 'b2', attrs: { documentId: null } }], [COLLECTION]);
    expect(out.b1).toEqual({ view: null });
    expect(out.b2).toBeUndefined();
  });

  it('says nothing of its document while the plugin is turned off, however readable', async () => {
    const out = await resolve([{ blockId: 'b1', attrs: { documentId: DOC } }, { blockId: 'b2', attrs: { documentId: null } }], [DOC, COLLECTION], false);
    expect(out.b1).toEqual({ view: null });
    expect(out.b2).toBeUndefined();
  });
});
