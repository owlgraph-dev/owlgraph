// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The `search` query field; the host schema registers it.
import { builder, NodeTypeEnum } from '$lib/features/query/graphql/builder.server';
import { searchContent, type SearchHit } from '$lib/features/search/server';
import type { NodeType } from '$lib/features/nodes';

const SearchResult = builder.objectRef<SearchHit>('SearchResult').implement({
  description: 'A single content item matching a search, scoped to the requesting user.',
  fields: (t) => ({
    id: t.exposeID('id'),
    type: t.expose('type', { type: NodeTypeEnum }),
    title: t.exposeString('title'),
    url: t.exposeString('url', { description: 'Relative URL at which the item can be viewed.' }),
    snippet: t.exposeString('snippet', {
      description: 'Highlighted excerpt; matches are wrapped in control-char sentinels for the client to render.'
    })
  })
});

export function registerSearchQueryFields(): void {
  builder.queryFields((t) => ({
    search: t.field({
      type: [SearchResult],
      description:
        "Full-text search over readable pages and documents — titles, text and metadata, ranked by relevance. Each node is matched in its own content language (its `locale`), and the query is read in every language a node can carry, so one query finds each language's inflections. Results are limited to what the requesting user is allowed to read.",
      args: {
        text: t.arg.string({ required: true, description: 'The search text.' }),
        types: t.arg({
          type: [NodeTypeEnum],
          required: false,
          description: 'Restrict results to these content types. Omit for all types.'
        }),
        first: t.arg.int({
          required: false,
          defaultValue: 20,
          description: 'Maximum number of results (capped server-side).'
        }),
        offset: t.arg.int({ required: false, defaultValue: 0, description: 'Result offset for paging.' })
      },
      resolve: (_root, args, ctx) =>
        searchContent(ctx.user, {
          text: args.text,
          types: (args.types ?? null) as NodeType[] | null,
          first: args.first,
          offset: args.offset
        })
    })
  }));
}
