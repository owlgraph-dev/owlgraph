// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/pages/[id]/versions/+server.ts.
import { json } from '@sveltejs/kit';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { getPage, userCanWritePage } from '$lib/features/pages/server';
import { listVersions, captureStandaloneVersion } from '$lib/features/pages/server';
import { unwrapUnknown, type JsonDoc } from '$lib/features/content';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/platform/apiErrors';

type Params = { id: string };

// Gated on write access: only an editor has use for the history.
export const GET: RequestHandler<Params> = async ({ params, locals }) => {
  const page = await getPage(params.id);
  if (!page) return apiError('not_found', { kind: 'page' });
  if (!(await userCanWritePage(locals.user, page))) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'page', resourceId: params.id });
  return json({ versions: await listVersions(params.id) });
};

// Keeps an unsaved doc whose edit lock was taken over, without touching the
// page; returns the current doc to diff against.
export const POST: RequestHandler<Params> = async ({ params, request, locals }) => {
  const page = await getPage(params.id);
  if (!page) return apiError('not_found', { kind: 'page' });
  if (!(await userCanWritePage(locals.user, page))) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'page', resourceId: params.id });
  const body = await request.json().catch(() => ({}));
  if (!body?.doc || typeof body.doc !== 'object') return apiError('invalid_request', { field: 'doc' });
  const versionId = await captureStandaloneVersion({
    nodeType: 'page',
    nodeId: params.id,
    // A client that didn't unwrap its unknown blocks is unwrapped here (docs/architecture/blocks/anatomy.md, "Unknown blocks").
    payload: unwrapUnknown(body.doc as JsonDoc),
    kind: 'lost_draft',
    authorId: locals.user?.id ?? null,
    baseVersionId: typeof body.baseVersionId === 'string' ? body.baseVersionId : null,
  });
  return json({ versionId, currentDoc: page.doc });
};
