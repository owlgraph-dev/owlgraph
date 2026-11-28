// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The one gate of a write to a node over the API, shared by the route adapters
// of pages, documents and collections. A node the caller may not read is not
// theirs to learn of: its write is answered as a write to one that does not
// exist, and so is an id that is none (docs/features/002-visibility-and-spaces.md,
// criterion 5). One they read and may not change is forbidden (criterion 12).
import { apiForbidden } from '#lib/features/auth/routes/requireAction.server.ts';
import { getCollection, type CollectionRow } from '#lib/features/collections/server.ts';
import { getDocument, type DocumentRow } from '#lib/features/documents/server.ts';
import { isUuid, type NodeType } from '#lib/features/nodes/index.ts';
import { userCanReadNode, userCanWriteNode, type NodeAccessRow } from '#lib/features/nodes/server.ts';
import { getPage, type PageRow } from '#lib/features/pages/server.ts';
import { apiError } from '#lib/platform/apiErrors.ts';
import { logEvent } from '#lib/platform/logger.server.ts';

async function writable<Row extends NodeAccessRow>(
  locals: App.Locals,
  kind: NodeType,
  id: string,
  load: (id: string) => Promise<Row | null>
): Promise<Row | Response> {
  const row = isUuid(id) ? await load(id) : null;
  if (!row) return apiError('not_found', { kind });
  if (!(await userCanReadNode(locals.user, row))) {
    // Answered as missing, logged as what it is: the probing line
    // (docs/architecture/logging.md, "Authorization").
    logEvent(locals.log, 'authz.denied', { action: 'page:write', resourceType: kind, resourceId: id, via: 'api' });
    return apiError('not_found', { kind });
  }
  if (!(await userCanWriteNode(locals.user, row))) return apiForbidden(locals.log, { action: 'page:write', resourceType: kind, resourceId: id });
  return row;
}

/** The page `id` names, when the caller may change it; otherwise the answer to give. */
export function writablePage(locals: App.Locals, id: string): Promise<PageRow | Response> {
  return writable(locals, 'page', id, getPage);
}

/** The document `id` names, when the caller may change it; otherwise the answer to give. */
export function writableDocument(locals: App.Locals, id: string): Promise<DocumentRow | Response> {
  return writable(locals, 'document', id, getDocument);
}

/** The collection `id` names, when the caller may change it; otherwise the answer to give. */
export function writableCollection(locals: App.Locals, id: string): Promise<CollectionRow | Response> {
  return writable(locals, 'collection', id, getCollection);
}
