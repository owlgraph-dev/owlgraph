// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/collections/[id]/+server.ts.
import { logEvent } from '#lib/platform/logger.server.ts';
import { apiForbidden } from '#lib/features/auth/routes/requireAction.server.ts';
import { writableCollection } from '#lib/features/nodes/routes/writable.server.ts';
import { collectionEmbed, renameCollection, refreshCollectionSearchMeta } from '#lib/features/collections/server.ts';
import { setNodeTags, setManualProperties, setNodeClasses } from '#lib/features/semantic/server.ts';
import { deleteNode, setNodeLocale, setNodeShares, setNodeSpace, setNodeVisibility } from '#lib/features/nodes/server.ts';
import { isUuid, type Visibility } from '#lib/features/nodes/index.ts';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiErrorFrom } from '#lib/platform/apiErrors.ts';
import { isCodedError } from '#lib/platform/codedError.ts';

type Params = { id: string };

const VISIBILITIES = ['public', 'internal', 'restricted'];

// The editor's view of a collection block, resolved as a reader's page resolves
// it (docs/architecture/blocks/node-embeds.md, "Collection and document blocks"). The same 404 for a
// missing collection and one the viewer may not read.
export const GET: RequestHandler<Params> = async ({ params, locals }) => {
  const embed = isUuid(params.id) ? await collectionEmbed(params.id, locals.user) : null;
  if (!embed || embed.state === 'hidden') return apiError('not_found', { kind: 'collection' });
  return Response.json({ embed });
};

// PATCH /api/documents/[id] field for field.
export const PATCH: RequestHandler<Params> = async ({ params, request, locals }) => {
  const collection = await writableCollection(locals, params.id);
  if (collection instanceof Response) return collection;

  const body = await request.json().catch(() => ({}));
  try {
    const out: Record<string, unknown> = {};
    if (typeof body.title === 'string' || typeof body.slug === 'string') {
      const changes: { title?: string; slug?: string } = {};
      if (typeof body.title === 'string') changes.title = body.title;
      if (typeof body.slug === 'string') changes.slug = body.slug;
      const renamed = await renameCollection(params.id, changes);
      if (!renamed) return apiError('not_found', { kind: 'collection' });
      out.id = renamed.id;
      out.title = renamed.title;
      out.slug = renamed.slug;
    }
    if (Array.isArray(body.tags)) out.tags = await setNodeTags(params.id, body.tags);
    if (Array.isArray(body.properties)) out.properties = await setManualProperties(params.id, body.properties);
    if (body.visibility === null || typeof body.visibility === 'string') {
      if (body.visibility !== null && !VISIBILITIES.includes(body.visibility)) return apiError('invalid_visibility');
      const stored = await setNodeVisibility(params.id, body.visibility as Visibility | null, { touch: true });
      logEvent(locals.log, 'node.visibility_changed', {
        nodeId: params.id,
        nodeType: 'collection',
        from: collection.visibility as Visibility | null,
        to: stored,
        actorId: locals.user?.id ?? null,
      });
      out.visibility = stored;
    }
    if (Array.isArray(body.shares)) {
      const change = await setNodeShares(params.id, body.shares);
      logEvent(locals.log, 'node.shares_changed', {
        nodeId: params.id,
        nodeType: 'collection',
        granteeIds: change.shares,
        addedIds: change.added,
        removedIds: change.removed,
        actorId: locals.user?.id ?? null,
      });
      out.shares = change.shares;
    }
    if (typeof body.spaceId === 'string') {
      await setNodeSpace(params.id, body.spaceId, locals.user);
      out.spaceId = body.spaceId;
    }
    // As PATCH /api/pages/[id] takes them.
    if (Array.isArray(body.classIds)) {
      if (!body.classIds.every((id: unknown) => typeof id === 'string')) return apiError('invalid_request', { field: 'classIds' });
      out.classIds = (await setNodeClasses(params.id, body.classIds)).map((c) => c.id);
    }
    if (typeof body.locale === 'string') {
      await setNodeLocale(params.id, body.locale);
      out.locale = body.locale;
    }
    if ('tags' in out || 'properties' in out) await refreshCollectionSearchMeta(params.id);
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
  const collection = await writableCollection(locals, params.id);
  if (collection instanceof Response) return collection;
  await deleteNode(collection.id);
  logEvent(locals.log, 'node.deleted', { nodeId: collection.id, nodeType: 'collection', actorId: locals.user?.id ?? null });
  return Response.json({ ok: true });
};
