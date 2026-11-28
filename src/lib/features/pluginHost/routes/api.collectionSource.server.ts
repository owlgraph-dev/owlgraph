// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /api/collections/[id]/source, re-exported by src/routes/api/collections/[id]/source/+server.ts.
// Connects a mirrored collection to its source anew (docs/architecture/plugins.md, "Sources"): its writers may, and each
// check spends the writer's failed credential checks, as a plugin route's does.
import { logEvent } from '#lib/platform/logger.server.ts';
import { writableCollection } from '#lib/features/nodes/routes/writable.server.ts';
import { connectCollectionSource, credentialChecks } from '#lib/features/pluginHost/server.ts';
import type { RequestHandler } from '@sveltejs/kit';
import { apiError } from '#lib/platform/apiErrors.ts';

type Params = { id: string };

export const PUT: RequestHandler<Params> = async ({ params, request, locals }) => {
  // 404, not 403, for one the viewer may not read: its existence is not theirs to learn.
  const collection = await writableCollection(locals, params.id);
  if (collection instanceof Response) return collection;
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
