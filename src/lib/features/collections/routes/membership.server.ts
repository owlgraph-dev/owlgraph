// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Shared by api.collectionMembers.server.ts and api.collectionMember.server.ts.
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { getCollection, userCanReadCollection, userCanWriteCollection, type CollectionRow } from '$lib/features/collections/server';
import { isUuid } from '$lib/features/nodes';
import { apiError } from '$lib/platform/apiErrors';

/**
 * 404 for one the viewer may not read (as if it were not there), 403 for one
 * they may read but not write, 409 for one an integration mirrors.
 */
export async function arrangeableCollection(locals: App.Locals, id: string): Promise<CollectionRow | Response> {
  if (!isUuid(id)) return apiError('not_found', { kind: 'collection' });
  const collection = await getCollection(id);
  if (!collection || !(await userCanReadCollection(locals.user, collection))) return apiError('not_found', { kind: 'collection' });
  if (!(await userCanWriteCollection(locals.user, collection))) {
    return apiForbidden(locals.log, { action: 'page:write', resourceType: 'collection', resourceId: id });
  }
  if (collection.plugin !== null) return apiError('mirrored');
  return collection;
}
