// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /api/collections/[id]/source, re-exported by src/routes/api/collections/[id]/source/+server.ts.
// Connects a mirrored collection to its source anew (docs/architecture/plugins.md, "Sources"): its writers may, and each
// check spends the writer's failed credential checks, as a plugin route's does.
import { json } from '@sveltejs/kit';
import { logEvent } from '$lib/platform/logger.server';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { getCollection, userCanReadCollection, userCanWriteCollection } from '$lib/features/collections/server';
import { connectCollectionSource, credentialChecks } from '$lib/features/pluginHost/server';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/platform/apiErrors';

type Params = { id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PUT: RequestHandler<Params> = async ({ params, request, locals }) => {
  const collection = UUID.test(params.id) ? await getCollection(params.id) : null;
  // 404, not 403, for one the viewer may not read: its existence is not theirs to learn.
  if (!collection || !(await userCanReadCollection(locals.user, collection))) return apiError('not_found', { kind: 'collection' });
  if (!(await userCanWriteCollection(locals.user, collection))) {
    return apiForbidden(locals.log, { action: 'page:write', resourceType: 'collection', resourceId: params.id });
  }
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return apiError('json_required');
  const checker = `user:${locals.user!.id}`;
  const checks = credentialChecks.allowed(checker);
  if (!checks.allowed) {
    logEvent(locals.log, 'auth.rate_limited', { limiter: 'integrations-credential', retryAfterMs: checks.retryAfterMs });
    return apiError('rate_limited', {}, { headers: { 'retry-after': String(Math.ceil(checks.retryAfterMs / 1000)) } });
  }
  const body = await request.json().catch(() => null);
  const answer = await connectCollectionSource(collection, (body as { values?: unknown } | null)?.values, {
    user: locals.user,
    locale: locals.locale,
    log: locals.log,
  });
  if (answer.status >= 400 && answer.status < 500) credentialChecks.failed(checker);
  answer.headers.set('cache-control', 'private, no-store');
  return answer;
};
