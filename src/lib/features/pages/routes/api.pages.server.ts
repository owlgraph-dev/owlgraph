// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/pages/+server.ts.
import { logEvent } from '#lib/platform/logger.server.ts';
import { apiForbidden } from '#lib/features/auth/routes/requireAction.server.ts';
import { createBlankPage } from '#lib/features/pages/server.ts';
import { can } from '#lib/features/auth/server.ts';
import { isUuid } from '#lib/features/nodes/index.ts';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiErrorFrom } from '#lib/platform/apiErrors.ts';
import { isCodedError } from '#lib/platform/codedError.ts';

// The real boundary: the app bar's own check is UX only.
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!can(locals.user, 'page:write')) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'route' });
  const body = await request.json().catch(() => ({}));
  const spaceId = typeof body.spaceId === 'string' && body.spaceId ? body.spaceId : undefined;
  if (spaceId !== undefined && !isUuid(spaceId)) return apiError('unknown_space');
  const title = typeof body.title === 'string' ? body.title : undefined;
  try {
    const page = await createBlankPage(locals.user!, spaceId, title);
    logEvent(locals.log, 'node.created', {
      nodeId: page.id,
      nodeType: 'page',
      spaceId: page.space_id ?? null,
      actorId: locals.user?.id ?? null,
    });
    return Response.json({ id: page.id, slug: page.slug, spaceSlug: page.space_slug });
  } catch (e) {
    if (isCodedError(e, 'space_membership_required')) {
      return apiForbidden(locals.log, { action: 'space:place', resourceType: 'space', code: 'space_membership_required' });
    }
    return apiErrorFrom(e);
  }
};
