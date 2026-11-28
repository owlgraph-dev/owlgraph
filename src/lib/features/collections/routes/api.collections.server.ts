// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/collections/+server.ts.
import { logEvent } from '#lib/platform/logger.server.ts';
import { can } from '#lib/features/auth/server.ts';
import { apiForbidden } from '#lib/features/auth/routes/requireAction.server.ts';
import { createCollection, getCollection } from '#lib/features/collections/server.ts';
import { isUuid } from '#lib/features/nodes/index.ts';
import * as m from '#lib/paraglide/messages.js';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiErrorFrom } from '#lib/platform/apiErrors.ts';
import { isCodedError } from '#lib/platform/codedError.ts';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!can(locals.user, 'page:write')) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'route' });
  const body = await request.json().catch(() => ({}));
  const spaceId = typeof body.spaceId === 'string' && body.spaceId ? body.spaceId : undefined;
  if (spaceId !== undefined && !isUuid(spaceId)) return apiError('unknown_space');
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : m.collection_new_title();
  try {
    const { id, slug } = await createCollection({ title, createdBy: locals.user!.id, user: locals.user, spaceId });
    const created = await getCollection(id);
    logEvent(locals.log, 'node.created', { nodeId: id, nodeType: 'collection', spaceId: created?.space_id ?? null, actorId: locals.user?.id ?? null });
    return Response.json({ id, slug, spaceSlug: created?.space_slug ?? null }, { status: 201 });
  } catch (e) {
    if (isCodedError(e, 'space_membership_required')) {
      return apiForbidden(locals.log, { action: 'space:place', resourceType: 'space', code: 'space_membership_required' });
    }
    return apiErrorFrom(e);
  }
};
