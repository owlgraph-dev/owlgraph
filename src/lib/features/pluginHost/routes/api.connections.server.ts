// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapters for /api/connections/[plugin] (+ /poll, /check, /flow), re-exported by src/routes/api/connections/[plugin]/**/+server.ts.
// A signed-in person's own connection (docs/architecture/plugins.md, "Connections"): each acts on the session's and the
// person's own rows only, and a write is JSON, which a form on another site cannot send.
import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { logEvent } from '$lib/platform/logger.server';
import { RateLimiter } from '$lib/platform/rateLimit';
import { beginConnect, cancelConnect, disconnect, flowDepsFor, pollConnect, recheck, type FlowDeps } from '$lib/features/pluginHost/server';
import { apiError } from '$lib/platform/apiErrors';

type Params = { plugin: string };

// Per person: a connect polls every two seconds for a few minutes at most.
const limiter = new RateLimiter(120, 60_000);

const noStore = { 'cache-control': 'private, no-store' };

/** The flow's dependencies for this request, or the answer that refuses it. */
function prepare(event: RequestEvent<Params>): FlowDeps | Response {
  const { locals, request } = event;
  if (!locals.user || !locals.sessionId) return apiError('unauthorized');
  if (request.method !== 'DELETE' && !(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return apiError('json_required');
  }
  const check = limiter.check(locals.user.id);
  if (!check.allowed) {
    logEvent(locals.log, 'auth.rate_limited', { limiter: 'connections-user', retryAfterMs: check.retryAfterMs });
    return apiError('rate_limited', {}, { headers: { 'retry-after': String(Math.ceil(check.retryAfterMs / 1000)) } });
  }
  const deps = flowDepsFor(event.params.plugin, { userId: locals.user.id, sessionId: locals.sessionId, log: locals.log, appHost: event.url.host });
  return deps ?? apiError('not_found');
}

const BEGIN_REFUSAL = { disabled: 'plugin_disabled', 'no-key': 'secret_key_missing', unreachable: 'upstream_unreachable', refused: 'upstream_refused' } as const;

/** POST /api/connections/[plugin]: where to approve a new connect; the handshake stays here. */
export const begin: RequestHandler<Params> = async (event) => {
  const deps = prepare(event);
  if (deps instanceof Response) return deps;
  const started = await beginConnect(deps);
  return started.ok
    ? json({ approveUrl: started.approveUrl }, { headers: noStore })
    : apiError(BEGIN_REFUSAL[started.reason], {}, { headers: noStore });
};

/** POST /api/connections/[plugin]/poll */
export const poll: RequestHandler<Params> = async (event) => {
  const deps = prepare(event);
  if (deps instanceof Response) return deps;
  const result = await pollConnect(deps);
  const answer =
    result.state === 'connected'
      ? { state: result.state, accountLabel: result.accountLabel }
      : result.state === 'failed'
        ? { state: result.state, reason: result.reason }
        : { state: result.state };
  return json(answer, { headers: noStore });
};

/** POST /api/connections/[plugin]/check */
export const check: RequestHandler<Params> = async (event) => {
  const deps = prepare(event);
  if (deps instanceof Response) return deps;
  return json({ status: await recheck(deps) }, { headers: noStore });
};

/** DELETE /api/connections/[plugin]/flow */
export const cancel: RequestHandler<Params> = async (event) => {
  const deps = prepare(event);
  if (deps instanceof Response) return deps;
  await cancelConnect(deps);
  return json({ ok: true }, { headers: noStore });
};

/** DELETE /api/connections/[plugin] */
export const remove: RequestHandler<Params> = async (event) => {
  const deps = prepare(event);
  if (deps instanceof Response) return deps;
  return json(await disconnect(deps), { headers: noStore });
};
