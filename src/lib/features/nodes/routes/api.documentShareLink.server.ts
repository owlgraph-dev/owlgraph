// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/documents/[id]/share-links/[linkId]/+server.ts.
import { json } from '@sveltejs/kit';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { logEvent } from '$lib/platform/logger.server';
import { getDocument, userCanWriteDocument } from '$lib/features/documents/server';
import { revokeShareLink } from '$lib/features/nodes/server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/platform/apiErrors';

type Params = { id: string; linkId: string };

export const DELETE: RequestHandler<Params> = async ({ params, locals }) => {
  const doc = await getDocument(params.id);
  if (!doc) return apiError('not_found', { kind: 'document' });
  if (!userCanWriteDocument(locals.user, doc)) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'document', resourceId: params.id });
  await revokeShareLink(params.linkId, params.id);
  // Logged here: the adapter knows the actor, revokeShareLink doesn't.
  logEvent(locals.log, 'share.revoked', {
    shareLinkId: params.linkId,
    nodeId: params.id,
    actorId: locals.user?.id ?? null,
  });
  return json({ ok: true });
};
