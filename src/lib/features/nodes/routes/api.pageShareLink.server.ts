// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/pages/[id]/share-links/[linkId]/+server.ts.
import { json } from '@sveltejs/kit';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { logEvent } from '$lib/platform/logger.server';
import { getPage, userCanWritePage } from '$lib/features/pages/server';
import { revokeShareLink } from '$lib/features/nodes/server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/platform/apiErrors';

type Params = { id: string; linkId: string };

export const DELETE: RequestHandler<Params> = async ({ params, locals }) => {
  const page = await getPage(params.id);
  if (!page) return apiError('not_found', { kind: 'page' });
  if (!(await userCanWritePage(locals.user, page))) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'page', resourceId: params.id });
  await revokeShareLink(params.linkId, params.id);
  // Logged here: the adapter knows the actor, revokeShareLink doesn't.
  logEvent(locals.log, 'share.revoked', {
    shareLinkId: params.linkId,
    nodeId: params.id,
    actorId: locals.user?.id ?? null,
  });
  return json({ ok: true });
};
