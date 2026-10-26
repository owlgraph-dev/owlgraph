// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/pages/+server.ts.
import { json } from '@sveltejs/kit';
import { logEvent } from '$lib/platform/logger.server';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { createBlankPage } from '$lib/features/pages/server';
import { can } from '$lib/features/auth/server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiErrorFrom } from '$lib/platform/apiErrors';
import { isCodedError } from '$lib/platform/codedError';

// The real boundary: the app bar's own check is UX only.
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!can(locals.user, 'page:write')) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'route' });
  const body = await request.json().catch(() => ({}));
  const namespaceId = typeof body.namespaceId === 'string' && body.namespaceId ? body.namespaceId : undefined;
  const title = typeof body.title === 'string' ? body.title : undefined;
  try {
    const page = await createBlankPage(locals.user!, namespaceId, title);
    logEvent(locals.log, 'node.created', {
      nodeId: page.id,
      nodeType: 'page',
      namespaceId: page.namespace_id ?? null,
      actorId: locals.user?.id ?? null,
    });
    return json({ id: page.id, slug: page.slug, namespaceSlug: page.namespace_slug });
  } catch (e) {
    if (isCodedError(e, 'namespace_membership_required')) {
      return apiForbidden(locals.log, { action: 'namespace:place', resourceType: 'namespace', code: 'namespace_membership_required' });
    }
    return apiErrorFrom(e);
  }
};
