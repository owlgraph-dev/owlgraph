// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/documents/[id]/share-links/+server.ts.
import { json } from '@sveltejs/kit';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { getDocument, userCanWriteDocument } from '$lib/features/documents/server';
import { createShareLink, listShareLinks } from '$lib/features/nodes/server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/platform/apiErrors';

type Params = { id: string };

export const GET: RequestHandler<Params> = async ({ params, locals }) => {
  const doc = await getDocument(params.id);
  if (!doc) return apiError('not_found', { kind: 'document' });
  if (!userCanWriteDocument(locals.user, doc)) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'document', resourceId: params.id });
  return json(await listShareLinks(params.id));
};

// Returns the raw token once; it can never be retrieved again.
export const POST: RequestHandler<Params> = async ({ params, request, locals }) => {
  const doc = await getDocument(params.id);
  if (!doc) return apiError('not_found', { kind: 'document' });
  if (!userCanWriteDocument(locals.user, doc)) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'document', resourceId: params.id });
  const body = await request.json().catch(() => ({}));
  const link = await createShareLink(params.id, locals.user?.id ?? null, String(body.label ?? ''), locals.log);
  return json(link);
};
