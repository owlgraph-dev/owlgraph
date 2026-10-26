// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/documents/[id]/+server.ts.
import { json } from '@sveltejs/kit';
import { logEvent } from '$lib/platform/logger.server';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import {
  documentEmbed,
  getDocument,
  getDocumentShares,
  renameDocument,
  setDocumentShares,
  userCanWriteDocument,
  refreshDocumentSearchMeta,
  clearDocumentLocaleSuggestion,
} from '$lib/features/documents/server';
import { setNodeTags } from '$lib/features/semantic/server';
import { setManualProperties } from '$lib/features/semantic/server';
import { setNodeClass } from '$lib/features/semantic/server';
import { deleteNode, setNodeLocale, setNodeNamespace, setNodeVisibility } from '$lib/features/nodes/server';
import { isUuid, type Visibility } from '$lib/features/nodes';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiErrorFrom } from '$lib/platform/apiErrors';
import { isCodedError } from '$lib/platform/codedError';

type Params = { id: string };

const VISIBILITIES = ['public', 'internal', 'restricted'];

// The editor's view of a document block, resolved as a reader's page resolves it
// (docs/architecture/blocks/node-embeds.md, "Collection and document blocks"). The same 404 for a missing
// document and one the viewer may not read.
export const GET: RequestHandler<Params> = async ({ params, locals }) => {
  const embed = isUuid(params.id) ? await documentEmbed(params.id, locals.user) : null;
  if (!embed || embed.state === 'hidden') return apiError('not_found', { kind: 'document' });
  return json({ embed });
};

// Mirrors PATCH /api/pages/[id].
export const PATCH: RequestHandler<Params> = async ({ params, request, locals }) => {
  const doc = await getDocument(params.id);
  if (!doc) return apiError('not_found', { kind: 'document' });
  if (!userCanWriteDocument(locals.user, doc)) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'document', resourceId: params.id });

  const body = await request.json().catch(() => ({}));
  try {
    const out: Record<string, unknown> = {};
    if (typeof body.title === 'string' || typeof body.slug === 'string') {
      const changes: { title?: string; slug?: string } = {};
      if (typeof body.title === 'string') changes.title = body.title;
      if (typeof body.slug === 'string') changes.slug = body.slug;
      const renamed = await renameDocument(params.id, changes);
      if (!renamed) return apiError('not_found', { kind: 'document' });
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
    // A level, or null to inherit again.
    if (body.visibility === null || typeof body.visibility === 'string') {
      if (body.visibility !== null && !VISIBILITIES.includes(body.visibility)) return apiError('invalid_visibility');
      const stored = await setNodeVisibility(params.id, body.visibility as Visibility | null, { touch: true });
      logEvent(locals.log, 'node.visibility_changed', {
        nodeId: params.id,
        nodeType: 'document',
        from: doc.visibility as Visibility | null,
        to: stored,
        actorId: locals.user?.id ?? null,
      });
      out.visibility = stored;
    }
    if (Array.isArray(body.shares)) {
      // setDocumentShares doesn't report what was added or removed; the event diffs.
      const before = await getDocumentShares(params.id);
      const granteeIds = await setDocumentShares(params.id, body.shares);
      logEvent(locals.log, 'node.shares_changed', {
        nodeId: params.id,
        nodeType: 'document',
        granteeIds,
        addedIds: granteeIds.filter((id) => !before.includes(id)),
        removedIds: before.filter((id) => !granteeIds.includes(id)),
        actorId: locals.user?.id ?? null,
      });
      out.shares = granteeIds;
    }
    if (typeof body.namespaceId === 'string') {
      await setNodeNamespace(params.id, body.namespaceId, locals.user);
      out.namespaceId = body.namespaceId;
    }
    // null resets to the document type class.
    if (body.nodeClassId === null || typeof body.nodeClassId === 'string') {
      out.nodeClassId = (await setNodeClass(params.id, body.nodeClassId)).id;
    }
    // Must be an enabled language; reindexes this node's search and answers a
    // detected-language suggestion (docs/architecture/languages.md).
    if (typeof body.locale === 'string') {
      await setNodeLocale(params.id, body.locale);
      out.locale = body.locale;
    }
    if (body.dismissLocaleSuggestion === true) {
      await clearDocumentLocaleSuggestion(params.id);
      out.dismissLocaleSuggestion = true;
    }
    if ('tags' in out || 'properties' in out) await refreshDocumentSearchMeta(params.id);
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
  const doc = await getDocument(params.id);
  if (!doc) return apiError('not_found', { kind: 'document' });
  if (!userCanWriteDocument(locals.user, doc)) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'document', resourceId: params.id });
  await deleteNode(doc.id);
  logEvent(locals.log, 'node.deleted', { nodeId: doc.id, nodeType: 'document', actorId: locals.user?.id ?? null });
  return json({ ok: true });
};
