// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/collections/+server.ts.
import { json } from '@sveltejs/kit';
import { logEvent } from '$lib/platform/logger.server';
import { can } from '$lib/features/auth/server';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { createCollection, getCollection } from '$lib/features/collections/server';
import { isUuid } from '$lib/features/nodes';
import * as m from '$lib/paraglide/messages';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiErrorFrom } from '$lib/platform/apiErrors';
import { isCodedError } from '$lib/platform/codedError';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!can(locals.user, 'page:write')) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'route' });
  const body = await request.json().catch(() => ({}));
  const namespaceId = typeof body.namespaceId === 'string' && body.namespaceId ? body.namespaceId : undefined;
  if (namespaceId !== undefined && !isUuid(namespaceId)) return apiError('unknown_namespace');
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : m.collection_new_title();
  try {
    const { id, slug } = await createCollection({ title, createdBy: locals.user!.id, user: locals.user, namespaceId });
    const created = await getCollection(id);
    logEvent(locals.log, 'node.created', { nodeId: id, nodeType: 'collection', namespaceId: created?.namespace_id ?? null, actorId: locals.user?.id ?? null });
    return json({ id, slug, namespaceSlug: created?.namespace_slug ?? null }, { status: 201 });
  } catch (e) {
    if (isCodedError(e, 'namespace_membership_required')) {
      return apiForbidden(locals.log, { action: 'namespace:place', resourceType: 'namespace', code: 'namespace_membership_required' });
    }
    return apiErrorFrom(e);
  }
};
