// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/documents/+server.ts.
import { apiForbidden } from '#lib/features/auth/routes/requireAction.server.ts';
import { createDocument, createLinkDocument } from '#lib/features/documents/server.ts';
import { parseExternalUrl } from '#lib/features/documents/index.ts';
import { can } from '#lib/features/auth/server.ts';
import { readFormData } from '#lib/platform/formData.ts';
import { logEvent } from '#lib/platform/logger.server.ts';
import { readDocumentUpload, uploadTooLarge } from './documentUpload.server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiErrorFrom } from '#lib/platform/apiErrors.ts';
import { isCodedError } from '#lib/platform/codedError.ts';

// An uploaded file, or with `source=link` an external URL and a title.
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!can(locals.user, 'page:write')) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'route' });

  const form = await readFormData(request);
  if (form === 'too-large') return uploadTooLarge(locals);
  const spaceId = form?.get('spaceId');
  const placement = typeof spaceId === 'string' && spaceId ? spaceId : undefined;
  if (form?.get('source') === 'link') return createLink(locals, form, placement);
  if (form?.get('source') === 'plugin') return apiError('plugin_document');

  const upload = await readDocumentUpload(form, locals);
  if (upload instanceof Response) return upload;

  try {
    const { id, slug } = await createDocument({
      ...upload,
      title: String(form?.get('title') ?? ''),
      createdBy: locals.user!.id,
      user: locals.user!,
      spaceId: placement,
    });
    logEvent(locals.log, 'node.created', {
      nodeId: id,
      nodeType: 'document',
      spaceId: placement ?? null,
      actorId: locals.user?.id ?? null,
      source: 'upload',
    });
    return Response.json({ id, slug });
  } catch (e) {
    return createFailed(locals, e);
  }
};

// The title is required: there is no filename to fall back on.
async function createLink(locals: App.Locals, form: FormData | null, spaceId: string | undefined): Promise<Response> {
  const parsed = parseExternalUrl(String(form?.get('externalUrl') ?? ''));
  if (!parsed.ok) return apiError('invalid_address', { reason: parsed.reason });
  const title = String(form?.get('title') ?? '').trim();
  if (title === '') return apiError('title_required');
  try {
    const { id, slug } = await createLinkDocument({
      url: parsed.url,
      title,
      createdBy: locals.user!.id,
      user: locals.user!,
      spaceId,
    });
    logEvent(locals.log, 'node.created', {
      nodeId: id,
      nodeType: 'document',
      spaceId: spaceId ?? null,
      actorId: locals.user?.id ?? null,
      source: 'link',
    });
    return Response.json({ id, slug });
  } catch (e) {
    return createFailed(locals, e);
  }
}

function createFailed(locals: App.Locals, e: unknown): Response {
  if (isCodedError(e, 'space_membership_required')) {
    return apiForbidden(locals.log, { action: 'space:place', resourceType: 'space', code: 'space_membership_required' });
  }
  return apiErrorFrom(e);
}
