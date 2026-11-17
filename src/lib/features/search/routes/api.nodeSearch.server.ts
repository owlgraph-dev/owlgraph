// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /api/node-search, re-exported by src/routes/api/node-search/+server.ts.
import { documentPlugins } from '#lib/features/documents/server.ts';
import { collectionPlugins } from '#lib/features/collections/server.ts';
import { searchNodesForUser } from '#lib/features/nodes/server.ts';
import { nodePath } from '#lib/features/nodes/index.ts';
import { pluginLabel } from '#lib/plugins/index.ts';
import { parseNodeSearchParams } from '../nodeSearchParams';
import { recentNodesForUser } from '../recentNodes.server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '#lib/platform/apiErrors.ts';

// The node picker's search, filtered to what the viewer may read (docs/architecture/search.md,
// "The node picker").
export const GET: RequestHandler = async ({ url, locals }) => {
  const typed = parseNodeSearchParams(url.searchParams);
  if (!typed) return apiError('invalid_request', { field: 'types' });
  const { hits, more, exact } =
    typed.recent && !typed.q
      ? { hits: await recentNodesForUser(locals.user, typed), more: false, exact: [] }
      : await searchNodesForUser(locals.user, typed.q, typed);
  const [documents, collections] = await Promise.all([
    documentPlugins(hits.filter((h) => h.type === 'document').map((h) => h.id)),
    collectionPlugins(hits.filter((h) => h.type === 'collection').map((h) => h.id)),
  ]);
  return Response.json({
    results: hits.map((h) => {
      const plugin = documents.get(h.id) ?? collections.get(h.id) ?? null;
      return {
        type: h.type,
        id: h.id,
        title: h.title,
        slug: h.slug,
        href: nodePath(h.namespace_slug, h.slug),
        namespace: h.namespace_name,
        plugin,
        pluginLabel: plugin ? pluginLabel(plugin) : null,
      };
    }),
    more,
    exact,
  });
};
