// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /api/search-count, re-exported by src/routes/api/search-count/+server.ts.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { countNodes } from '$lib/features/query/server';
import { resolveSearchParams } from '$lib/features/search/server';
import { parseSearchParams } from '$lib/features/search';

// The filter sheet's "Show N results" for pending filters: the search page's own
// parameters through the same chain, so it matches what the page then shows.
// Viewer-scoped, so never cached.
export const GET: RequestHandler = async ({ url, locals }) => {
  const { query } = await resolveSearchParams(locals.user, parseSearchParams(url.searchParams));
  const total = await countNodes(locals.user, { filter: query.filter, text: query.text });
  return json({ total }, { headers: { 'cache-control': 'no-store' } });
};
