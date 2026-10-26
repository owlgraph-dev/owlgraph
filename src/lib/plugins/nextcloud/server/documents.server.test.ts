// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import type { PluginNode, PluginRequest } from '$lib/plugins/api';
import { fakeHost, jsonResponses } from '../e2e/fakeHost';
import { checkDocumentRoute, createDocumentRoute, getDocumentRoute, rebindDocumentRoute, searchDocumentsRoute } from './documents.server';
import { t } from '../messages';

// The host's secrets, connections and writes refuse, so a route that reached
// for one while the plugin is off would fail the test.

const SHARED = '2b4f0c1e-6d3a-4c59-9e1a-7f0b3c2d1e44';
const OWN = '3c5a1d2f-7e4b-4d6a-8f2b-8a1c4d3e2f55';
const HIDDEN = '4d6b2e3a-8f5c-4e7b-9a3c-9b2d5e4f3a66';
const COLLECTION = '6f1c1a52-0c5a-4b8e-9d0f-6b1f0e2a9c11';

const shared: PluginNode = {
  id: SHARED,
  type: 'document',
  title: 'Quartalsbericht',
  href: '/quartalsbericht',
  ref: { path: '2026 Q3/Bericht.pdf', fileid: '48213', etag: '"e1"', modified: '2026-10-02T09:30:00.000Z', status: 'ok', checkedAt: '2026-10-09T10:00:00.000Z', seenAt: '2026-10-09T10:00:00.000Z', collectionId: COLLECTION },
  file: { filename: 'Bericht.pdf', mime: 'application/pdf', size: 123456 },
  content: { view: `/api/documents/${SHARED}/content`, download: `/api/documents/${SHARED}/content?download` },
};
const own: PluginNode = {
  id: OWN,
  type: 'document',
  title: 'Protokoll',
  href: '/protokoll',
  ref: { fileid: '777', pathHint: 'Projekte/Protokoll.md', hintUid: 'alice', etag: '"e2"', modified: '2026-10-03T09:30:00.000Z', status: 'ok', checkedAt: '2026-10-09T10:00:00.000Z', seenAt: '2026-10-09T10:00:00.000Z', collectionId: null },
  file: { filename: 'Protokoll.md', mime: 'text/markdown', size: 42 },
  content: { view: `/api/documents/${OWN}/content`, download: `/api/documents/${OWN}/content?download` },
};
const collection: PluginNode = {
  id: COLLECTION,
  type: 'collection',
  title: 'Unterlagen',
  href: '/unterlagen',
  ref: { path: '', name: 'Projektunterlagen', status: 'ok', count: 3 },
  file: null,
  content: null,
};
const nodes: Record<string, PluginNode> = { [SHARED]: shared, [OWN]: own, [COLLECTION]: collection };

/** HIDDEN is the one node this editor cannot read. */
function offHost(opts: { writes?: boolean } = {}) {
  return fakeHost({
    origin: null,
    enabled: false,
    viewerId: 'u0000000-0000-4000-8000-000000000001',
    nodes: {
      read: async (id) => nodes[id] ?? null,
      canWrite: async () => opts.writes ?? true,
      search: async () => [shared, own],
    },
    respond: jsonResponses,
  });
}

const request = (params: Record<string, string> = {}, body?: unknown, query = ''): PluginRequest => ({ params, query: new URLSearchParams(query), body });

const offView = (node: PluginNode) => ({
  id: node.id,
  title: node.title,
  href: node.href,
  content: null,
  file: null,
  path: null,
  fileid: null,
  own: false,
  modified: null,
  status: 'disabled',
  checkedAt: null,
  seenAt: null,
  collectionId: null,
  location: null,
});

async function expectNothingOfTheFiles(res: Response) {
  const text = await res.clone().text();
  for (const fact of ['Bericht.pdf', 'Protokoll.md', '123456', 'Projektunterlagen', '2026 Q3', '48213', '777', '/content']) expect(text).not.toContain(fact);
}

describe('the document routes while the plugin is turned off', () => {
  it('answer a document as its node and that the plugin is off — nothing of its file, where it lies or its links', async () => {
    for (const node of [shared, own]) {
      const res = await getDocumentRoute(request({ id: node.id }), offHost());
      expect(res.status).toBe(200);
      expect(await res.clone().json()).toEqual({ document: offView(node) });
      await expectNothingOfTheFiles(res);
    }
  });

  it('look nothing up on a check and keep nothing: the editor is told the plugin is off', async () => {
    const host = offHost();
    for (const node of [shared, own]) {
      const res = await checkDocumentRoute(request({ id: node.id }, {}), host);
      expect(res.status).toBe(200);
      expect(await res.clone().json()).toEqual({ document: offView(node), problem: 'disabled' });
      await expectNothingOfTheFiles(res);
    }
    expect(host.logs).toEqual({ upstreamFailed: [], sourceState: [] });
  });

  it("offer the picker's documents each as its node alone, and say the plugin is off", async () => {
    const res = await searchDocumentsRoute(request({}, undefined, 'q='), offHost());
    expect(await res.clone().json()).toEqual({ documents: [offView(shared), offView(own)], reason: 'disabled' });
    await expectNothingOfTheFiles(res);
  });

  it('refuse to make a document of a file, or to bind one to another, as the plugin being off', async () => {
    const host = offHost();
    const answers = [
      await createDocumentRoute(request({}, { collectionId: COLLECTION, path: '2026 Q3/Plan.pdf', fileid: '48214' }), host),
      await createDocumentRoute(request({}, { besidePageId: 'a0000000-0000-4000-8000-0000000000a1', own: { path: 'Projekte/Plan.md', fileid: '778' } }), host),
      await rebindDocumentRoute(request({ id: SHARED }, { path: '2026 Q3/Plan.pdf', fileid: '48214' }), host),
      await rebindDocumentRoute(request({ id: OWN }, { own: { path: 'Projekte/Plan.md', fileid: '778' } }), host),
    ];
    for (const res of answers) {
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: { code: 'plugin_disabled', message: t('connect_disabled') } });
    }
    expect(host.logs).toEqual({ upstreamFailed: [], sourceState: [] });
  });

  it('still answer a document the viewer may not read as missing, and a check by one who may not write it as forbidden', async () => {
    expect((await getDocumentRoute(request({ id: HIDDEN }), offHost())).status).toBe(404);
    expect((await checkDocumentRoute(request({ id: HIDDEN }, {}), offHost())).status).toBe(404);
    expect((await checkDocumentRoute(request({ id: SHARED }, {}), offHost({ writes: false }))).status).toBe(403);
    expect((await rebindDocumentRoute(request({ id: SHARED }, { path: '2026 Q3/Plan.pdf', fileid: '48214' }), offHost({ writes: false }))).status).toBe(403);
  });
});
