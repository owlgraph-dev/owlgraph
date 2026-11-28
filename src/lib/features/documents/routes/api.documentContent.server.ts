// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/documents/[id]/content/+server.ts
// (docs/architecture/documents.md, "The content endpoint").
import { logEvent } from '#lib/platform/logger.server.ts';
import { writableDocument } from '#lib/features/nodes/routes/writable.server.ts';
import { isUuid } from '#lib/features/nodes/index.ts';
import {
  getDocument,
  getDocumentBytes,
  replaceDocumentBytes,
  setDocumentLink,
  userCanReadDocument,
  documentBytesResponse,
  externalContentResponse,
  type DocumentRow,
} from '#lib/features/documents/server.ts';
import { parseExternalUrl, type DocumentSource } from '#lib/features/documents/index.ts';
import { servePluginDocument } from '#lib/features/pluginHost/server.ts';
import { readFormData } from '#lib/platform/formData.ts';
import { readDocumentUpload, uploadTooLarge } from './documentUpload.server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, textError } from '#lib/platform/apiErrors.ts';

type Params = { id: string };

// 404, not 403, for a reader who may not read it, so existence isn't revealed.
// Gated bytes are never cached: a cached copy would outlive the session.
export const GET: RequestHandler<Params> = async ({ params, url, locals }) => {
  const doc = isUuid(params.id) ? await getDocument(params.id) : null;
  if (!doc) return textError('not_found', { kind: 'document' });
  if (!(await userCanReadDocument(locals.user, doc))) return textError('not_found', { kind: 'document' });

  if (doc.source === 'link') {
    const res = externalContentResponse(doc.external_url);
    if (!res) return textError('not_found', { kind: 'document' });
    return res;
  }
  // Typically a redirect to a grant minted for this reader (docs/architecture/plugins.md, "Sources").
  if (doc.source === 'plugin') {
    const res = await servePluginDocument(doc, { download: url.searchParams.has('download') }, { user: locals.user, locale: locals.locale, log: locals.log });
    if (!res) return textError('not_found', { kind: 'document' });
    return res;
  }

  const data = await getDocumentBytes(params.id);
  if (!data) return textError('not_found', { kind: 'document' });
  return documentBytesResponse(data, {
    download: url.searchParams.has('download'),
    // Effective, not raw: inheriting 'public' from the space is just as cacheable.
    cacheControl: (doc.visibility ?? doc.space_access_level) === 'public' ? 'public, max-age=3600' : 'private, no-store',
  });
};

// A multipart `file` or JSON `{ externalUrl }`, switching the source when it
// differs: a switch to 'link' deletes the stored file, so the editor confirms it first.
// Reachable without a session: a caller who may not read the document, signed
// out or not, is answered as for one that does not exist.
export const PUT: RequestHandler<Params> = async ({ params, request, locals }) => {
  const doc = await writableDocument(locals, params.id);
  if (doc instanceof Response) return doc;
  // A document from an integration keeps its source.
  if (doc.source === 'plugin') return apiError('source_fixed');

  const type = request.headers.get('content-type') ?? '';
  if (type.startsWith('multipart/form-data')) return putFile(doc, request, locals);
  if (type.startsWith('application/json')) return putLink(doc, request, locals);
  return apiError('unsupported_media_type');
};

async function putFile(doc: DocumentRow, request: Request, locals: App.Locals): Promise<Response> {
  const form = await readFormData(request);
  if (form === 'too-large') return uploadTooLarge(locals);
  const upload = await readDocumentUpload(form, locals);
  if (upload instanceof Response) return upload;

  const before = await replaceDocumentBytes(doc.id, upload);
  if (!before) return apiError('not_found', { kind: 'document' });
  sourceChanged(locals, doc.id, before, 'upload');
  return Response.json({ ok: true, source: 'upload', filename: upload.filename, mime: upload.mime, size: upload.bytes.length });
}

async function putLink(doc: DocumentRow, request: Request, locals: App.Locals): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const parsed = parseExternalUrl(typeof body?.externalUrl === 'string' ? body.externalUrl : '');
  if (!parsed.ok) return apiError('invalid_address', { reason: parsed.reason });

  const before = await setDocumentLink(doc.id, parsed.url);
  if (!before) return apiError('not_found', { kind: 'document' });
  sourceChanged(locals, doc.id, before, 'link');
  return Response.json({ ok: true, source: 'link', externalUrl: parsed.url });
}

// Replacing a file or editing an address within one source is not a switch.
function sourceChanged(locals: App.Locals, nodeId: string, from: DocumentSource, to: DocumentSource): void {
  if (from === to) return;
  logEvent(locals.log, 'document.source_changed', { nodeId, from, to, actorId: locals.user?.id ?? null });
}
