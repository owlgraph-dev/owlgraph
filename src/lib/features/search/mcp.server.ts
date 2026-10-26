// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The overlay's own searchContent path, viewer-scoped the same way.
import { z } from 'zod';
import type { ToolRegistry } from '../../../mcp/registry';
import { text } from '../../../mcp/registry';
import { searchContent } from '$lib/features/search/server';
import { HL_START, HL_STOP } from '$lib/features/search';

export function registerSearchTools({ user, tool }: ToolRegistry): void {
  tool(
    'search',
    {
      title: 'Search',
      description:
        'Full-text search across pages, documents and collections you can read, ranked by relevance (title matches outrank heading, then body matches); a collection is also found by the title of a member you can read, its snippet then "Contains: <title>". Supports quoted "phrases", OR, and -excludeTerm. Returns id, type (page, document or collection), title, url, and a short context snippet. Follow up with get_page using a page result\'s id, get_document_text / get_document using a document result\'s id, or get_collection using a collection result\'s id.',
      inputSchema: { query: z.string(), limit: z.number().int().positive().max(50).optional() },
    },
    'search',
    async ({ query, limit }) => {
      const hits = await searchContent(user, { text: query, first: limit ?? 20 });
      // The highlight sentinels mean nothing to an agent.
      const out = hits.map((h) => ({
        id: h.id,
        type: h.type,
        title: h.title,
        url: h.url,
        snippet: h.snippet ? h.snippet.split(HL_START).join('').split(HL_STOP).join('') : '',
      }));
      return text(JSON.stringify(out, null, 2));
    }
  );
}
