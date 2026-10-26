// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { createLinkDocument } from '$lib/features/documents/server';
import { getGraph } from '$lib/features/graph/server';
import { createPage, saveDoc } from '$lib/features/pages/server';
import { connectAs, jsonOf } from '$tests/integration/mcp';
import { userOf } from '$tests/integration/users';
import { createCollection } from './server';
import { addMember } from './members.server';

async function seeded() {
  const admin = await userOf('admin');
  const first = await createLinkDocument({ url: 'https://example.org/first', title: 'First member', createdBy: admin.id, user: admin });
  const second = await createLinkDocument({ url: 'https://example.org/second', title: 'Second member', createdBy: admin.id, user: admin });
  const c = await createCollection({ title: 'Agents’ collection', createdBy: admin.id, user: admin });
  await db.begin(async (sql) => {
    await addMember(sql, c.id, first.id);
    await addMember(sql, c.id, second.id);
  });
  return { ...c, first, second };
}

describe('a collection', () => {
  it('is read by agents — its members in order, at positions 1–2, with no plugin — walked along contains by traverse, and drawn in the graph', async () => {
    const c = await seeded();
    const agent = await connectAs('viewer');
    const got = jsonOf<{ members: { id: string; position: number }[]; plugin: string | null }>(await agent.callTool({ name: 'get_collection', arguments: { collectionId: c.id } }));
    expect(got.members.map((m) => [m.id, m.position])).toEqual([[c.first.id, 1], [c.second.id, 2]]);
    expect(got.plugin).toBeNull();

    const walked = jsonOf<{ id: string }[]>(
      await agent.callTool({ name: 'traverse', arguments: { query: { start: { nodeIds: [c.id] }, steps: [{ edge: { type: 'contains', direction: 'outgoing' }, repeat: 1 }] } } })
    );
    expect(walked.map((n) => n.id).sort()).toEqual([c.first.id, c.second.id].sort());

    const graph = await getGraph(await userOf('admin'));
    expect(graph.nodes.find((node) => node.id === c.id)?.type).toBe('collection');
    expect(graph.edges.filter((e) => e.source === c.id && e.relationshipType === 'contains').map((e) => e.target).sort()).toEqual([c.first.id, c.second.id].sort());
  });

  it('is found by a member’s title, and so is the member — never the page that embeds the collection', async () => {
    const admin = await userOf('admin');
    const c = await createCollection({ title: 'Embedded collection', createdBy: admin.id, user: admin });
    const member = await createPage('Notiz zitronenbaum', admin);
    await db.begin((sql) => addMember(sql, c.id, member.id));
    const embeddingPage = await createPage('Host page', admin);
    await saveDoc(embeddingPage.id, { type: 'doc', content: [{ type: 'collectionBlock', attrs: { blockId: 'embedded', nodeId: c.id } }] });

    const ids = jsonOf<{ id: string }[]>(await (await connectAs('admin')).callTool({ name: 'search', arguments: { query: 'zitronenbaum' } })).map((h) => h.id);
    expect(ids).toContain(member.id);
    expect(ids).toContain(c.id);
    expect(ids).not.toContain(embeddingPage.id);
  });
});
