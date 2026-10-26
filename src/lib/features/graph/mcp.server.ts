// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Viewer scoping is the domain functions' own (readableNodes); none is added here.
import { z } from 'zod';
import type { ToolRegistry } from '../../../mcp/registry';
import { text } from '../../../mcp/registry';
import { edgeDirectionEnum } from '$lib/features/query/server';
import { getOutgoingEdges, getIncomingEdges } from '$lib/features/graph/server';
import { getNodeRelationships } from '$lib/features/graph/server';

export function registerGraphTools({ user, tool, pageTool }: ToolRegistry): void {
  pageTool(
    'get_edges',
    { title: 'Get edges', description: 'List the pages this page has an edge to: its outgoing knowledge-graph edges, from its links and its blocks.', inputSchema: { pageId: z.string() } },
    'read',
    async (page) => text(JSON.stringify(await getOutgoingEdges(page.id, user), null, 2))
  );

  pageTool(
    'get_incoming_edges',
    { title: 'Get incoming edges', description: 'List the pages that have an edge to this page: its incoming knowledge-graph edges, the pages its "Referenced by" lists.', inputSchema: { pageId: z.string() } },
    'read',
    async (page) => text(JSON.stringify(await getIncomingEdges(page.id, user), null, 2))
  );

  tool(
    'get_relationships',
    {
      title: 'Get relationships',
      description:
        "List a node's TYPED edges (relationship_type is set) — the typed-edge analogue of get_edges/get_incoming_edges, which list a page's edges without their types. Returns each edge's relationship type, label, inverse label, edge properties, and the connected node's identity (id/type/title/url), scoped to what you can read. Omit `type` to see every typed relationship in use on this node — that's the discovery path if you don't have access to list_relationship_types (editor/admin only). Follow up with get_page/get_document_text on a result's node.id, or feed it into traverse for multi-hop walks.",
      inputSchema: {
        nodeId: z.string(),
        type: z.string().optional(),
        direction: edgeDirectionEnum.optional(),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    'page:read',
    async ({ nodeId, type, direction, limit }) =>
      text(JSON.stringify(await getNodeRelationships(user, nodeId, { type, direction, limit }), null, 2))
  );
}
