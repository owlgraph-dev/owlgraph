// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/documents/+server.ts.
import { json } from '@sveltejs/kit';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { createDocument, createLinkDocument } from '$lib/features/documents/server';
import { parseExternalUrl } from '$lib/features/documents';
import { can } from '$lib/features/auth/server';
import { readFormData } from '$lib/platform/formData';
import { logEvent } from '$lib/platform/logger.server';
import { readDocumentUpload, uploadTooLarge } from './documentUpload.server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiErrorFrom } from '$lib/platform/apiErrors';
import { isCodedError } from '$lib/platform/codedError';

// An uploaded file, or with `source=link` an external URL and a title.
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!can(locals.user, 'page:write')) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'route' });

  const form = await readFormData(request);
  if (form === 'too-large') return uploadTooLarge(locals);
  const namespaceId = form?.get('namespaceId');
  const placement = typeof namespaceId === 'string' && namespaceId ? namespaceId : undefined;
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
      namespaceId: placement,
    });
    logEvent(locals.log, 'node.created', {
      nodeId: id,
      nodeType: 'document',
      namespaceId: placement ?? null,
      actorId: locals.user?.id ?? null,
      source: 'upload',
    });
    return json({ id, slug });
  } catch (e) {
    return createFailed(locals, e);
  }
};

// The title is required: there is no filename to fall back on.
async function createLink(locals: App.Locals, form: FormData | null, namespaceId: string | undefined): Promise<Response> {
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
      namespaceId,
    });
    logEvent(locals.log, 'node.created', {
      nodeId: id,
      nodeType: 'document',
      namespaceId: namespaceId ?? null,
      actorId: locals.user?.id ?? null,
      source: 'link',
    });
    return json({ id, slug });
  } catch (e) {
    return createFailed(locals, e);
  }
}

function createFailed(locals: App.Locals, e: unknown): Response {
  if (isCodedError(e, 'namespace_membership_required')) {
    return apiForbidden(locals.log, { action: 'namespace:place', resourceType: 'namespace', code: 'namespace_membership_required' });
  }
  return apiErrorFrom(e);
}
