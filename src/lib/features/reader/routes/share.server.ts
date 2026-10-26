// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/share/[id]/+page.server.ts.
import { error } from '@sveltejs/kit';
import { resolveShareLink } from '$lib/features/nodes/server';
import { getNodeType } from '$lib/features/nodes/server';
import { getPage } from '$lib/features/pages/server';
import { getIncomingEdges, getLocalGraph } from '$lib/features/graph/server';
import { getDocument } from '$lib/features/documents/server';
import { renderPage } from '$lib/features/reader/server';
import type { ServerLoadEvent } from '@sveltejs/kit';

type Params = { id: string };

// The share_links row is the authorization (nodes/shareLinks.server.ts),
// whatever the node's visibility. locals.user is never read for access here or
// downstream: a signed-in visitor sees exactly what an anonymous one would.
export const load = async ({ params, locals, setHeaders }: ServerLoadEvent<Params>) => {
  // No browser copy, so after a revoke Back shows nothing (docs/architecture/authorization.md,
  // "What a browser keeps").
  setHeaders({ 'cache-control': 'private, no-store' });
  const shareId = params.id;
  const resolved = await resolveShareLink(params.id, locals.log);
  if (!resolved) throw error(404, 'Not found'); // unknown and revoked answer alike

  const type = await getNodeType(resolved.nodeId);
  if (!type) throw error(404, 'Not found');

  if (type === 'page') {
    const page = await getPage(resolved.nodeId);
    if (!page) throw error(404, 'Not found');
    // Every block's data as nobody: the link grants the page, not what its blocks show.
    const rendered = await renderPage(page, { kind: 'share', locale: locals.locale, log: locals.log });
    return {
      kind: 'page' as const,
      title: page.title,
      locale: page.locale,
      html: rendered.html,
      imagePreloads: rendered.preloads,
      css: rendered.css,
      canvasRuleId: rendered.canvasRuleId,
      groundRuleId: rendered.groundRuleId,
      afterRuleId: rendered.afterRuleId,
      referencedBy: await getIncomingEdges(page.id, null),
      localGraph: await getLocalGraph(page.id, null),
      firstBlockBleeds: rendered.firstBlockBleeds,
      contentScheme: rendered.contentScheme,
    };
  }

  // A collection is shared through the pages that show it, never by a link.
  if (type !== 'document') throw error(404, 'Not found');

  const doc = await getDocument(resolved.nodeId);
  if (!doc) throw error(404, 'Not found');
  return {
    kind: 'document' as const,
    shareId,
    doc: {
      id: doc.id,
      title: doc.title,
      source: doc.source,
      external_url: doc.external_url,
      filename: doc.filename,
      mime: doc.mime,
      size: doc.size,
      locale: doc.locale,
    },
  };
};
