// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/media/+server.ts.
import { json } from '@sveltejs/kit';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { getPage, userCanWritePage } from '$lib/features/pages/server';
import { createImageAsset, matchesImageType, ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES } from '$lib/features/media/server';
import { mediaUrl } from '$lib/features/media';
import { readFormData } from '$lib/platform/formData';
import { logEvent } from '$lib/platform/logger.server';
import type { RequestHandler } from '@sveltejs/kit';
import { isCodedError } from '$lib/platform/codedError';
import { apiError } from '$lib/platform/apiErrors';

// The filename is never logged: it is user content, often personal
// (docs/architecture/logging.md, "Never logged").
const rejected = (locals: App.Locals, reason: 'type' | 'size' | 'content' | 'missing', bytes?: number) =>
  logEvent(locals.log, 'upload.rejected', { kind: 'image', reason, bytes });

const tooLarge = () =>
  apiError('too_large', { limit: Math.round(MAX_IMAGE_BYTES / 1024 / 1024) });

// An image belongs to `pageId`; uploading it takes write access to that page.
export const POST: RequestHandler = async ({ request, locals }) => {
  const form = await readFormData(request);
  if (form === 'too-large') {
    rejected(locals, 'size');
    return tooLarge();
  }
  const file = form?.get('file');
  const pageId = String(form?.get('pageId') ?? '');

  if (!(file instanceof File)) {
    rejected(locals, 'missing');
    return apiError('file_required');
  }
  if (!pageId) return apiError('invalid_request', { field: 'pageId' });

  const page = await getPage(pageId);
  if (!page) return apiError('not_found', { kind: 'page' });
  if (!(await userCanWritePage(locals.user, page))) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'page', resourceId: pageId });

  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    rejected(locals, 'type', file.size);
    return apiError('unsupported_file_type', { type: file.type || 'unknown' });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    rejected(locals, 'size', file.size);
    return tooLarge();
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // The declared size is the client's claim.
  if (bytes.length > MAX_IMAGE_BYTES) {
    rejected(locals, 'size', bytes.length);
    return tooLarge();
  }
  if (!matchesImageType(file.type, bytes)) {
    rejected(locals, 'content', bytes.length);
    return apiError('invalid_file_content');
  }

  try {
    // The editor offers the image's copies by its size (docs/architecture/media.md).
    const { id, size } = await createImageAsset({ bytes, mime: file.type, ownerPageId: pageId, createdBy: locals.user!.id, scope: 'page' });
    return json({ id, url: mediaUrl(id), size });
  } catch (e) {
    if (!isCodedError(e, 'invalid_image')) throw e;
    rejected(locals, 'content', bytes.length);
    return apiError('invalid_image');
  }
};
