// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/documents/[id]/share-links/[linkId]/+server.ts.
import { logEvent } from '#lib/platform/logger.server.ts';
import { revokeShareLink } from '#lib/features/nodes/server.ts';
import type { RequestHandler } from '@sveltejs/kit';
import { writableDocument } from './writable.server';

type Params = { id: string; linkId: string };

export const DELETE: RequestHandler<Params> = async ({ params, locals }) => {
  const doc = await writableDocument(locals, params.id);
  if (doc instanceof Response) return doc;
  await revokeShareLink(params.linkId, params.id);
  // Logged here: the adapter knows the actor, revokeShareLink doesn't.
  logEvent(locals.log, 'share.revoked', {
    shareLinkId: params.linkId,
    nodeId: params.id,
    actorId: locals.user?.id ?? null,
  });
  return Response.json({ ok: true });
};
