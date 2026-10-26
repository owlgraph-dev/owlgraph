// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /api/plugins/[plugin]/[...path], re-exported by src/routes/api/plugins/[plugin]/[...path]/+server.ts.
// The dispatcher enforces what each plugin route declares; the host keeps every node read and write to the viewer's access.
import { logEvent } from '$lib/platform/logger.server';
import { RateLimiter } from '$lib/platform/rateLimit';
import { apiForbidden } from '$lib/features/auth/routes/requireAction.server';
import { can } from '$lib/features/auth/server';
import { createPluginHost, credentialChecks, dispatchPluginRequest } from '$lib/features/pluginHost/server';
import { pluginServer } from '$lib/plugins/server';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { apiError } from '$lib/platform/apiErrors';

type Params = { plugin: string; path: string };

// Per client address, across every plugin: public pages' blocks call these routes
// as their readers browse, so the budget is a reader's, not a script's.
const limiter = new RateLimiter(300, 60_000);

// Behind the proxy, adapter-node throws when the address header is absent (a
// request that bypassed the proxy); such requests share one bucket.
function clientAddress(event: RequestEvent): string {
  try {
    return event.getClientAddress();
  } catch {
    return 'unknown';
  }
}

async function cappedText(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  const text = await request.text();
  return Buffer.byteLength(text) > limit ? null : text;
}

const handler: RequestHandler<Params> = async (event) => {
  const { params, url, request, locals } = event;
  // Still percent-encoded, so a `%2F` inside a segment stays inside it (the dispatcher refuses it).
  const rawPath = url.pathname.split('/').slice(4).join('/');
  // A person's failed credential checks are theirs wherever they sign in from.
  const checker = locals.user ? `user:${locals.user.id}` : `ip:${clientAddress(event)}`;
  return dispatchPluginRequest(
    {
      method: request.method,
      pluginId: params.plugin,
      rawPath,
      query: url.searchParams,
      contentType: request.headers.get('content-type'),
      text: (limit) => cappedText(request, limit),
    },
    {
      server: pluginServer,
      signedIn: !!locals.user,
      canManage: can(locals.user, 'integration:manage'),
      rateLimit: () => limiter.check(clientAddress(event)),
      credentialBudget: () => credentialChecks.allowed(checker),
      credentialFailed: () => credentialChecks.failed(checker),
      host: (pluginId) => createPluginHost(pluginId, { user: locals.user, locale: locals.locale, log: locals.log }),
      refused(kind, retryAfterMs = 0) {
        if (kind === 'rate' || kind === 'credential') {
          logEvent(locals.log, 'auth.rate_limited', { limiter: kind === 'rate' ? 'integrations-ip' : 'integrations-credential', retryAfterMs });
          return apiError('rate_limited', {}, { headers: { 'retry-after': String(Math.ceil(retryAfterMs / 1000)) } });
        }
        if (kind === 'manage') return apiForbidden(locals.log, { action: 'integration:manage', resourceType: 'route' });
        logEvent(locals.log, 'authz.denied', { action: 'session:required', resourceType: 'route', via: 'api' });
        return apiError('unauthorized');
      },
    }
  );
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
