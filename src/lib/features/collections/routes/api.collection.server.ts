// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/collections/[id]/+server.ts.
import { json } from '@sveltejs/kit';
import { logEvent } from '$lib/platform/logger.server';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import {
  collectionEmbed,
  getCollection,
  renameCollection,
  refreshCollectionSearchMeta,
  userCanReadCollection,
  userCanWriteCollection,
  type CollectionRow,
} from '$lib/features/collections/server';
import { setNodeTags, setManualProperties, setNodeClass } from '$lib/features/semantic/server';
import { deleteNode, setNodeLocale, setNodeNamespace, setNodeVisibility } from '$lib/features/nodes/server';
import { isUuid, type Visibility } from '$lib/features/nodes';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiErrorFrom } from '$lib/platform/apiErrors';
import { isCodedError } from '$lib/platform/codedError';

type Params = { id: string };

const VISIBILITIES = ['public', 'internal', 'restricted'];

/**
 * The same 404 for a collection that is missing, malformed or unreadable (its
 * existence is not theirs to learn); 403 for one they read but may not write.
 */
async function writableCollection(id: string, locals: App.Locals): Promise<CollectionRow | Response> {
  const collection = isUuid(id) ? await getCollection(id) : null;
  if (!collection || !(await userCanReadCollection(locals.user, collection))) return apiError('not_found', { kind: 'collection' });
  if (!(await userCanWriteCollection(locals.user, collection))) {
    return apiForbidden(locals.log, { action: 'page:write', resourceType: 'collection', resourceId: id });
  }
  return collection;
}

// The editor's view of a collection block, resolved as a reader's page resolves
// it (docs/architecture/blocks/node-embeds.md, "Collection and document blocks"). The same 404 for a
// missing collection and one the viewer may not read.
export const GET: RequestHandler<Params> = async ({ params, locals }) => {
  const embed = isUuid(params.id) ? await collectionEmbed(params.id, locals.user) : null;
  if (!embed || embed.state === 'hidden') return apiError('not_found', { kind: 'collection' });
  return json({ embed });
};

// PATCH /api/documents/[id] field for field, without shares: a collection has none.
export const PATCH: RequestHandler<Params> = async ({ params, request, locals }) => {
  const collection = await writableCollection(params.id, locals);
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
    if (typeof body.namespaceId === 'string') {
      await setNodeNamespace(params.id, body.namespaceId, locals.user);
      out.namespaceId = body.namespaceId;
    }
    // null resets to the collection type class.
    if (body.nodeClassId === null || typeof body.nodeClassId === 'string') {
      out.nodeClassId = (await setNodeClass(params.id, body.nodeClassId)).id;
    }
    if (typeof body.locale === 'string') {
      await setNodeLocale(params.id, body.locale);
      out.locale = body.locale;
    }
    if ('tags' in out || 'properties' in out) await refreshCollectionSearchMeta(params.id);
    return json(out);
  } catch (e) {
    // A slug taken in a race is the unique index's refusal.
    if ((e as { code?: string }).code === '23505') return apiError('slug_taken');
    if (isCodedError(e, 'namespace_membership_required')) {
      return apiForbidden(locals.log, { action: 'namespace:place', resourceType: 'namespace', code: 'namespace_membership_required' });
    }
    // A model's refusal answers with its code; anything else is the 500 path,
    // which logs it and answers without detail.
    return apiErrorFrom(e);
  }
};

export const DELETE: RequestHandler<Params> = async ({ params, locals }) => {
  const collection = await writableCollection(params.id, locals);
  if (collection instanceof Response) return collection;
  await deleteNode(collection.id);
  logEvent(locals.log, 'node.deleted', { nodeId: collection.id, nodeType: 'collection', actorId: locals.user?.id ?? null });
  return json({ ok: true });
};
