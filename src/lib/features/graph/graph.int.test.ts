// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, inject, it } from 'vitest';
import type { SessionUser } from '$lib/features/auth/server';
import { createPage, saveDoc, setPageShares, setPageVisibility } from '$lib/features/pages/server';
import { userOf } from '$tests/integration/users';
import { getIncomingEdges, getGraph, getLocalGraph } from './server';

// The seed's graph page (tests/support/seed.ts) links to the public page twice
// (untyped and "mentions"), the public document, the internal page and the
// restricted document (editorA's, shared with editorB; editorC is on no list).

const seed = inject('seed');

type Graph = { nodes: { id: string; type: string }[]; edges: { source: string; target: string; relationshipType?: string }[] };

const nodeIds = (graph: Graph) => graph.nodes.map((n) => n.id);
const edgeEnds = (graph: Graph) => graph.edges.flatMap((e) => [e.source, e.target]);
const targetsOf = (graph: Graph, source: string) => graph.edges.filter((e) => e.source === source).map((e) => e.target);

describe('the full graph', () => {
  it('admin sees every tier of node and edge in the full graph', async () => {
    const graph = await getGraph(await userOf('admin'));
    expect(nodeIds(graph)).toEqual(expect.arrayContaining([seed.graphPageId, seed.publicId, seed.publicDocId, seed.internalId, seed.restrictedDocId]));
    expect(targetsOf(graph, seed.graphPageId)).toEqual(expect.arrayContaining([seed.publicId, seed.publicDocId, seed.internalId, seed.restrictedDocId]));
    const toPublic = graph.edges.filter((e) => e.source === seed.graphPageId && e.target === seed.publicId);
    expect(toPublic).toHaveLength(2);
    expect(toPublic.map((e) => e.relationshipType ?? null)).toEqual(expect.arrayContaining([null, 'mentions']));
  });

  it('a signed-in viewer without document access sees the internal page but not the restricted document', async () => {
    const graph = await getGraph(await userOf('editorC'));
    expect(nodeIds(graph)).toEqual(expect.arrayContaining([seed.graphPageId, seed.publicId, seed.publicDocId, seed.internalId]));
    expect(targetsOf(graph, seed.graphPageId)).toEqual(expect.arrayContaining([seed.publicId, seed.publicDocId, seed.internalId]));
    expect(nodeIds(graph)).not.toContain(seed.restrictedDocId);
    expect(edgeEnds(graph)).not.toContain(seed.restrictedDocId);
  });
});

describe('the local graph', () => {
  it('local graph sidebar shows both a page and a document neighbour', async () => {
    const local = await getLocalGraph(seed.graphPageId, await userOf('admin'));
    expect(local.focusId).toBe(seed.graphPageId);
    expect(local.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: seed.publicId, type: 'page' }), expect.objectContaining({ id: seed.publicDocId, type: 'document' })])
    );
  });

  // A restricted page of editorA's, shared with editorB, links to the graph page.
  describe("a page's local graph and the pages it is referenced by, for a reader not on the list", () => {
    let linkerId: string;

    beforeAll(async () => {
      const [editorA, editorB] = [await userOf('editorA'), await userOf('editorB')];
      const linker = await createPage('Restricted linker', editorA);
      await setPageVisibility(linker.id, 'restricted');
      await setPageShares(linker.id, [editorB.id]);
      await saveDoc(linker.id, {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { blockId: 'p-in' },
            content: [{ type: 'text', text: 'Back to the graph page', marks: [{ type: 'pageLink', attrs: { targetPageId: seed.graphPageId, targetSlug: seed.graphPageSlug } }] }],
          },
        ],
      });
      linkerId = linker.id;
    });

    const readers: [string, () => Promise<SessionUser | null>][] = [
      ['editorC, signed in', () => userOf('editorC')],
      ['an anonymous reader', async () => null],
    ];

    it.each(readers)('lists only neighbours the reader may read, for %s', async (_, reader) => {
      const user = await reader();
      const local = await getLocalGraph(seed.graphPageId, user);
      expect(nodeIds(local)).toEqual(expect.arrayContaining([seed.publicId, seed.publicDocId]));
      expect(nodeIds(local)).not.toContain(seed.restrictedDocId);
      expect(nodeIds(local)).not.toContain(linkerId);
      expect(edgeEnds(local)).not.toContain(seed.restrictedDocId);
      expect(edgeEnds(local)).not.toContain(linkerId);
      expect((await getIncomingEdges(seed.graphPageId, user)).map((row) => row.id)).not.toContain(linkerId);
    });

    it('lists them for the reader on the list', async () => {
      const editorB = await userOf('editorB');
      const local = await getLocalGraph(seed.graphPageId, editorB);
      expect(nodeIds(local)).toEqual(expect.arrayContaining([seed.restrictedDocId, linkerId]));
      expect(edgeEnds(local)).toEqual(expect.arrayContaining([seed.restrictedDocId, linkerId]));
      expect((await getIncomingEdges(seed.graphPageId, editorB)).map((row) => row.id)).toEqual([linkerId]);
    });
  });
});
