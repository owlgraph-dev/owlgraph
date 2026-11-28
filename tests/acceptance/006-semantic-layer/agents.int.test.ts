// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { createCollection } from '#lib/features/collections/server.ts';
import { createLinkDocument } from '#lib/features/documents/server.ts';
import { createPage } from '#lib/features/pages/server.ts';
import { listNodeClasses, setNodeClasses, upsertNodeClass } from '#lib/features/semantic/server.ts';
import { connectAs, jsonOf } from '#tests/integration/mcp.ts';
import { userOf } from '#tests/integration/users.ts';

// A node's classes through an agent's tools (docs/features/006-semantic-layer.md,
// criterion 9).

type Kind = 'page' | 'document' | 'collection';

describe('a node’s classes, through an agent', () => {
  it('006.9 an agent’s tools name every class a page, a document and a collection has', async () => {
    const by = await userOf('admin');
    let made = 0;
    const twoClasses = async (kind: Kind) => {
      const parentId = (await listNodeClasses()).find((c) => c.kind === 'type' && c.slug === kind)!.id;
      const one = async (name: string) => (await upsertNodeClass({ slug: `agent-${name}-${kind}-${++made}`, label: { en: `${name} ${kind} ${made}` }, parentId })).id;
      return [await one('Ledger'), await one('Minutes')];
    };
    const nodes: Record<Kind, { id: string; tool: string; argument: string; classes: string[] }> = {
      page: { id: (await createPage('An agent’s page', by)).id, tool: 'get_page', argument: 'pageId', classes: await twoClasses('page') },
      document: {
        id: (await createLinkDocument({ url: 'https://example.org/file', title: 'An agent’s document', createdBy: by.id, user: by })).id,
        tool: 'get_document',
        argument: 'documentId',
        classes: await twoClasses('document'),
      },
      collection: {
        id: (await createCollection({ title: 'An agent’s collection', createdBy: by.id, user: by })).id,
        tool: 'get_collection',
        argument: 'collectionId',
        classes: await twoClasses('collection'),
      },
    };
    const agent = await connectAs('admin');
    for (const [kind, node] of Object.entries(nodes)) {
      await setNodeClasses(node.id, node.classes);
      const answer = jsonOf<{ classes: { id: string; name: string }[] }>(await agent.callTool({ name: node.tool, arguments: { [node.argument]: node.id } }));
      expect(answer.classes.map((c) => c.id).sort(), `${node.tool} for the ${kind}`).toEqual([...node.classes].sort());
      expect(answer.classes.every((c) => c.name.length > 0), `${node.tool} names each class`).toBe(true);
    }
  });
});
