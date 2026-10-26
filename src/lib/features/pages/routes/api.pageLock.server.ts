// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter, re-exported by src/routes/api/pages/[id]/lock/+server.ts.
import { json } from '@sveltejs/kit';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { getPage, userCanWritePage } from '$lib/features/pages/server';
import { getLock, acquireLock, releaseLock, forceReleaseLock } from '$lib/features/pages/server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/platform/apiErrors';

type Params = { id: string };

// Gated on write access: only a potential editor needs the holder.
export const GET: RequestHandler<Params> = async ({ params, locals }) => {
  const page = await getPage(params.id);
  if (!page) return apiError('not_found', { kind: 'page' });
  if (!(await userCanWritePage(locals.user, page))) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'page', resourceId: params.id });
  return json(await getLock(params.id));
};

export const POST: RequestHandler<Params> = async ({ params, request, locals }) => {
  const page = await getPage(params.id);
  if (!page) return apiError('not_found', { kind: 'page' });
  if (!(await userCanWritePage(locals.user, page))) return apiForbidden(locals.log, { action: 'page:write', resourceType: 'page', resourceId: params.id });
  const body = await request.json().catch(() => ({}));
  const force = body?.force === true && locals.user?.role === 'admin';
  const result = await acquireLock(params.id, locals.user!.id, force);
  if (result.granted) return json({ ok: true, token: result.token, status: result.status });
  return apiError('lock_lost', { status: result.status });
};

// With a token, the holder leaving; without, an admin's force-release.
export const DELETE: RequestHandler<Params> = async ({ params, request, locals }) => {
  const page = await getPage(params.id);
  if (!page) return apiError('not_found', { kind: 'page' });
  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token : null;
  if (token) {
    await releaseLock(params.id, token);
    return json({ ok: true });
  }
  if (locals.user?.role !== 'admin') return apiForbidden(locals.log, { action: 'page:lock_takeover', resourceType: 'page', resourceId: params.id });
  await forceReleaseLock(params.id);
  return json({ ok: true });
};
