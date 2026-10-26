// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/pages/[id]/apply-picks/+server.ts.
import { json } from '@sveltejs/kit';
import { logEvent } from '$lib/platform/logger.server';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { getPage, userCanWritePage, applyPicksToPage } from '$lib/features/pages/server';
import { droppedSummary, type BlockPick } from '$lib/features/pages';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/platform/apiErrors';

type Params = { id: string };

// The caller must hold the edit lock token: 423 otherwise (the draft version is
// saved regardless).
export const POST: RequestHandler<Params> = async ({ params, request, locals }) => {
  const page = await getPage(params.id);
  if (!page) return apiError('not_found', { kind: 'page' });
  if (!(await userCanWritePage(locals.user, page))) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'page', resourceId: params.id });
  const body = await request.json().catch(() => ({}));
  const picks = Array.isArray(body?.picks) ? (body.picks as BlockPick[]) : [];
  const lockToken = typeof body?.lockToken === 'string' ? body.lockToken : null;
  if (!picks.length) return apiError('invalid_request', { field: 'picks' });

  const result = await applyPicksToPage(params.id, picks, { lockToken, authorId: locals.user?.id ?? null });
  if (result.ok) return json({ ok: true });
  if (result.reason === 'lock') return apiError('lock_lost');
  if (result.reason === 'unknown_dropped') {
    logEvent(locals.log, 'page.unknown_drop_refused', { pageId: params.id, via: 'apply-picks', ...droppedSummary(result.dropped) });
    return apiError('unknown_blocks_dropped', { dropped: result.dropped });
  }
  return apiError('not_found', { kind: 'page' });
};
