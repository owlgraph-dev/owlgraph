// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/pages/[id]/+server.ts.
import { logEvent } from '#lib/platform/logger.server.ts';
import { apiForbidden } from '#lib/features/auth/routes/requireAction.server.ts';
import { writablePage } from '#lib/features/nodes/routes/writable.server.ts';
import { saveDoc, renamePage, setPageVisibility, setPageSpace, setPageContentScheme, deletePage } from '#lib/features/pages/server.ts';
import { getHomePageId } from '#lib/features/site/server.ts';
import { setNodeTags } from '#lib/features/semantic/server.ts';
import { setManualProperties } from '#lib/features/semantic/server.ts';
import { setNodeClasses } from '#lib/features/semantic/server.ts';
import { setNodeLocale, setNodeShares } from '#lib/features/nodes/server.ts';
import { getLock } from '#lib/features/pages/server.ts';
import { isContentScheme } from '#lib/features/content/index.ts';
import { ACKNOWLEDGE_DROPPED_HEADER, droppedSummary, isUnknownDropped, parseAcknowledged } from '#lib/features/pages/index.ts';
import type { Visibility } from '#lib/features/nodes/index.ts';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiErrorFrom } from '#lib/platform/apiErrors.ts';
import { isCodedError } from '#lib/platform/codedError.ts';

type Params = { id: string };

const VISIBILITIES = ['public', 'internal', 'restricted'];

export const PUT: RequestHandler<Params> = async ({ params, request, locals }) => {
  const page = await writablePage(locals, params.id);
  if (page instanceof Response) return page;
  const doc = await request.json();
  const lockToken = request.headers.get('x-edit-lock');
  // A header, so the body stays the document itself (unknownGuard.ts).
  const acknowledgeDropped = parseAcknowledged(request.headers.get(ACKNOWLEDGE_DROPPED_HEADER));
  try {
    const saved = await saveDoc(params.id, doc, { lockToken, authorId: locals.user?.id ?? null, acknowledgeDropped });
    if (!saved) return apiError('not_found', { kind: 'page' });
    return Response.json({ ok: true, updated_at: saved.updated_at });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === 'lock_lost') {
      // So the client can keep the unsaved work rather than discard it.
      return apiError('lock_lost', { status: await getLock(params.id) });
    }
    if (isUnknownDropped(e)) {
      logEvent(locals.log, 'page.unknown_drop_refused', { pageId: params.id, via: 'save', ...droppedSummary(e.details.dropped) });
      return apiError('unknown_blocks_dropped', { dropped: e.details.dropped });
    }
    throw e;
  }
};

// Page metadata. An absent field is left alone; an explicit null inherits.
export const PATCH: RequestHandler<Params> = async ({ params, request, locals }) => {
  const page = await writablePage(locals, params.id);
  if (page instanceof Response) return page;

  const body = await request.json().catch(() => ({}));
  try {
    const out: Record<string, unknown> = {};
    if (typeof body.title === 'string' || typeof body.slug === 'string') {
      const changes: { title?: string; slug?: string } = {};
      if (typeof body.title === 'string') changes.title = body.title;
      if (typeof body.slug === 'string') changes.slug = body.slug;
      const renamed = await renamePage(params.id, changes);
      if (!renamed) return apiError('not_found', { kind: 'page' });
      out.id = renamed.id;
      out.title = renamed.title;
      out.slug = renamed.slug;
    }
    if (Array.isArray(body.tags)) {
      out.tags = await setNodeTags(params.id, body.tags);
    }
    if (Array.isArray(body.properties)) {
      out.properties = await setManualProperties(params.id, body.properties);
    }
    // Echoes what was stored: 'public' is stored as inherit (setNodeVisibility).
    if (body.visibility === null || typeof body.visibility === 'string') {
      if (body.visibility !== null && !VISIBILITIES.includes(body.visibility)) return apiError('invalid_visibility');
      const stored = await setPageVisibility(params.id, body.visibility);
      logEvent(locals.log, 'node.visibility_changed', {
        nodeId: params.id,
        nodeType: 'page',
        from: page.visibility as Visibility | null,
        to: stored,
        actorId: locals.user?.id ?? null,
      });
      out.visibility = stored;
    }
    if (Array.isArray(body.shares)) {
      const change = await setNodeShares(params.id, body.shares);
      logEvent(locals.log, 'node.shares_changed', {
        nodeId: params.id,
        nodeType: 'page',
        granteeIds: change.shares,
        addedIds: change.added,
        removedIds: change.removed,
        actorId: locals.user?.id ?? null,
      });
      out.shares = change.shares;
    }
    if (body.contentScheme !== undefined) {
      if (body.contentScheme !== null && !isContentScheme(body.contentScheme)) return apiError('invalid_content_scheme');
      await setPageContentScheme(params.id, body.contentScheme);
      out.contentScheme = body.contentScheme;
    }
    if (typeof body.spaceId === 'string') {
      await setPageSpace(params.id, body.spaceId, locals.user);
      out.spaceId = body.spaceId;
    }
    // Every class the page has, none for its type alone; echoes what it states.
    if (Array.isArray(body.classIds)) {
      if (!body.classIds.every((id: unknown) => typeof id === 'string')) return apiError('invalid_request', { field: 'classIds' });
      out.classIds = (await setNodeClasses(params.id, body.classIds)).map((c) => c.id);
    }
    // An enabled language; reindexes this node's search only (docs/architecture/languages.md).
    if (typeof body.locale === 'string') {
      await setNodeLocale(params.id, body.locale);
      out.locale = body.locale;
    }
    return Response.json(out);
  } catch (e) {
    // A slug taken in a race is the unique index's refusal.
    if ((e as { code?: string }).code === '23505') return apiError('slug_taken');
    if (isCodedError(e, 'space_membership_required')) {
      return apiForbidden(locals.log, { action: 'space:place', resourceType: 'space', code: 'space_membership_required' });
    }
    // A model's refusal answers with its code; anything else is the 500 path,
    // which logs it and answers without detail.
    return apiErrorFrom(e);
  }
};

export const DELETE: RequestHandler<Params> = async ({ params, locals }) => {
  const page = await writablePage(locals, params.id);
  if (page instanceof Response) return page;
  if ((await getHomePageId()) === page.id) {
    return apiError('home_page');
  }
  await deletePage(page.id);
  logEvent(locals.log, 'node.deleted', { nodeId: page.id, nodeType: 'page', actorId: locals.user?.id ?? null });
  return Response.json({ ok: true });
};
