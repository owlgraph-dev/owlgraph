// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Client for /api/node-search, the node picker's search; the server filters it
// to what the viewer may read.
import type { NodeSearchPage, NodeSearchResult } from './types';

/**
 * Readable nodes of `types` whose title holds `query`, an exact title first
 * (docs/architecture/search.md, "The node picker"). Null when the search failed, so a picker
 * can say so rather than "nothing found".
 */
export async function searchNodes(
  query: string,
  opts: { types: readonly NodeSearchResult['type'][]; limit?: number; offset?: number; exclude?: Iterable<string>; recent?: boolean }
): Promise<NodeSearchPage | null> {
  const params = new URLSearchParams({ q: query, types: opts.types.join(',') });
  if (opts.recent) params.set('recent', '1');
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const exclude = [...(opts.exclude ?? [])];
  if (exclude.length) params.set('exclude', exclude.join(','));
  try {
    const res = await fetch(`/api/node-search?${params}`);
    if (!res.ok) return null;
    const body = await res.json();
    return { results: body.results ?? [], more: !!body.more, exact: body.exact ?? [] };
  } catch {
    return null;
  }
}
