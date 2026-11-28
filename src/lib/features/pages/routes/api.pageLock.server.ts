// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/pages/[id]/lock/+server.ts.
import { apiForbidden } from '#lib/features/auth/routes/requireAction.server.ts';
import { writablePage } from '#lib/features/nodes/routes/writable.server.ts';
import { isUuid } from '#lib/features/nodes/index.ts';
import { getPage, getLock, acquireLock, releaseLock, forceReleaseLock } from '#lib/features/pages/server.ts';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '#lib/platform/apiErrors.ts';

type Params = { id: string };

// Gated on write access: only a potential editor needs the holder.
export const GET: RequestHandler<Params> = async ({ params, locals }) => {
  const page = await writablePage(locals, params.id);
  if (page instanceof Response) return page;
  return Response.json(await getLock(params.id));
};

export const POST: RequestHandler<Params> = async ({ params, request, locals }) => {
  const page = await writablePage(locals, params.id);
  if (page instanceof Response) return page;
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true && locals.user?.role === 'admin';
  const result = await acquireLock(params.id, locals.user!.id, force);
  if (result.granted) return Response.json({ ok: true, token: result.token, status: result.status });
  return apiError('lock_lost', { status: result.status });
};

// With a token, the holder leaving: the token is the lock, so the page is not
// looked up, and a page whose existence the caller may not learn answers as
// any other. Without, an admin's force-release.
export const DELETE: RequestHandler<Params> = async ({ params, request, locals }) => {
  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token : null;
  if (token) {
    await releaseLock(params.id, token);
    return Response.json({ ok: true });
  }
  if (locals.user?.role !== 'admin') return apiForbidden(locals.log, { action: 'page:lock_takeover', resourceType: 'page', resourceId: params.id });
  const page = isUuid(params.id) ? await getPage(params.id) : null;
  if (!page) return apiError('not_found', { kind: 'page' });
  await forceReleaseLock(params.id);
  return Response.json({ ok: true });
};
