// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/share/[id]/content/+server.ts.
import { resolveShareLink } from '$lib/features/nodes/server';
import { getNodeType } from '$lib/features/nodes/server';
import { getDocument, getDocumentBytes, documentBytesResponse, externalContentResponse } from '$lib/features/documents/server';
import { servePluginDocument } from '$lib/features/pluginHost/server';
import type { RequestHandler } from '@sveltejs/kit';
import { textError } from '$lib/platform/apiErrors';

type Params = { id: string };

// Separate from /api/documents/[id]/content rather than a token bypass there:
// one capability check, easy to audit. The responses are shared
// (documents/serve.server.ts).
export const GET: RequestHandler<Params> = async ({ params, url, locals }) => {
  const resolved = await resolveShareLink(params.id, locals.log);
  if (!resolved) return textError('not_found', { kind: 'document' });
  if ((await getNodeType(resolved.nodeId)) !== 'document') return textError('not_found', { kind: 'document' });
  const doc = await getDocument(resolved.nodeId);
  if (!doc) return textError('not_found', { kind: 'document' });

  if (doc.source === 'link') {
    const res = externalContentResponse(doc.external_url);
    if (!res) return textError('not_found', { kind: 'document' });
    return res;
  }
  // For an anonymous viewer granted this one node; the grant re-checks the link
  // when redeemed (docs/architecture/plugins.md, "Grants").
  if (doc.source === 'plugin') {
    const res = await servePluginDocument(doc, { download: url.searchParams.has('download') }, {
      user: null,
      locale: locals.locale,
      log: locals.log,
      shareLink: { token: params.id, nodeId: doc.id },
    });
    if (!res) return textError('not_found', { kind: 'document' });
    return res;
  }

  const data = await getDocumentBytes(resolved.nodeId);
  if (!data) return textError('not_found', { kind: 'document' });
  return documentBytesResponse(data, {
    download: url.searchParams.has('download'),
    // Whatever the node's visibility: the URL is the secret, so no shared cache
    // may keep the bytes for whoever later observes it.
    cacheControl: 'private, no-store',
  });
};
