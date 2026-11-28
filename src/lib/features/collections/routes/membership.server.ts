// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Shared by api.collectionMembers.server.ts and api.collectionMember.server.ts.
import { writableCollection } from '#lib/features/nodes/routes/writable.server.ts';
import type { CollectionRow } from '#lib/features/collections/server.ts';
import { apiError } from '#lib/platform/apiErrors.ts';

/**
 * 404 for one the viewer may not read (as if it were not there), 403 for one
 * they may read but not write, 409 for one an integration mirrors.
 */
export async function arrangeableCollection(locals: App.Locals, id: string): Promise<CollectionRow | Response> {
  const collection = await writableCollection(locals, id);
  if (collection instanceof Response) return collection;
  if (collection.plugin !== null) return apiError('mirrored');
  return collection;
}
