// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, inject, it } from 'vitest';
import type { SessionUser } from '#lib/features/auth/server.ts';
import { getGraph } from '#lib/features/graph/server.ts';
import { connectAs, jsonOf, textOf } from '#tests/integration/mcp.ts';
import { userOf } from '#tests/integration/users.ts';

// 002.6, the two ways in that are no request to the app: the graph and an
// agent's tool. The seeded restricted page is editorA's, shared with editorB;
// a public page points to it by a typed relationship. The other six ways are
// ways-in.http.test.ts's.

const seed = inject('seed');

describe('the restricted page, asked for through the graph and through an agent', () => {
  it('002.6 the graph holds it, and the relationships that touch it, for the editor it is shared with, and for neither a visitor nor an editor it is not shared with', async () => {
    const inGraph = async (user: SessionUser | null) => {
      const graph = await getGraph(user);
      return {
        node: graph.nodes.some((n) => n.id === seed.restrictedId),
        edges: graph.edges.filter((e) => e.source === seed.restrictedId || e.target === seed.restrictedId).length > 0,
      };
    };
    expect(await inGraph(null)).toEqual({ node: false, edges: false });
    expect(await inGraph(await userOf('editorC'))).toEqual({ node: false, edges: false });
    expect(await inGraph(await userOf('editorB'))).toEqual({ node: true, edges: true });
  });

  it('002.6 an agent’s tools list it and find it for the editor it is shared with, and not for an editor it is not shared with', async () => {
    const through = async (role: 'editorB' | 'editorC') => {
      const agent = await connectAs(role);
      const listed = jsonOf<{ id: string }[]>(await agent.callTool({ name: 'list_pages', arguments: {} }));
      const found = textOf(await agent.callTool({ name: 'search', arguments: { query: seed.restrictedBody } }));
      return { listed: listed.some((p) => p.id === seed.restrictedId), found: found.includes(seed.restrictedTitle) };
    };
    expect(await through('editorC')).toEqual({ listed: false, found: false });
    expect(await through('editorB')).toEqual({ listed: true, found: true });
  });
});
