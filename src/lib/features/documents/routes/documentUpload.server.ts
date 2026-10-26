// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The checks every document upload passes, for POST /api/documents and
// PUT /api/documents/[id]/content. Importable only from the documents routes.
import { matchesDocumentType, ALLOWED_DOCUMENT_MIME, MAX_DOCUMENT_BYTES } from '$lib/features/documents/server';
import { logEvent } from '$lib/platform/logger.server';
import { apiError } from '$lib/platform/apiErrors';

export type DocumentUpload = { bytes: Buffer; mime: string; filename: string };

// Never the filename (see the same helper in media's api.media.server.ts).
const rejected = (locals: App.Locals, reason: 'type' | 'size' | 'content' | 'missing', bytes?: number) =>
  logEvent(locals.log, 'upload.rejected', { kind: 'document', reason, bytes });

const tooLarge = () =>
  apiError('too_large', { limit: Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024) });

// For a body readFormData found too large to parse at all.
export function uploadTooLarge(locals: App.Locals): Response {
  rejected(locals, 'size');
  return tooLarge();
}

// Either the checked upload or the error response to return as is.
export async function readDocumentUpload(form: FormData | null, locals: App.Locals): Promise<DocumentUpload | Response> {
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) {
    rejected(locals, 'missing');
    return apiError('file_required');
  }
  if (!ALLOWED_DOCUMENT_MIME.has(file.type)) {
    rejected(locals, 'type', file.size);
    return apiError('unsupported_file_type', { type: file.type || 'unknown' });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    rejected(locals, 'size', file.size);
    return tooLarge();
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    rejected(locals, 'size', bytes.length);
    return tooLarge();
  }
  if (!matchesDocumentType(file.type, bytes)) {
    rejected(locals, 'content', bytes.length);
    return apiError('invalid_file_content');
  }
  return { bytes, mime: file.type, filename: file.name };
}
