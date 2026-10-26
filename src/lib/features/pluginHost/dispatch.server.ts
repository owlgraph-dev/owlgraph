// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The dispatcher behind /api/plugins/<id>/… (docs/architecture/plugins.md, "Routes"). The
// catch-all is one public route id, so each plugin route's declared access is
// enforced here. Every request counts against the rate limit, an unknown one too
// (probing is traffic). A write's body must be JSON: a form on another site
// cannot post it, and a script there cannot without a CORS grant.
import type { PluginHost, PluginRoute, PluginServer } from '$lib/plugins/api';
import { apiError } from '$lib/platform/apiErrors';

export const MAX_BODY_BYTES = 64 * 1024;

export interface DispatchRequest {
  method: string;
  pluginId: string;
  /** The path below /api/plugins/<id>/, as received (still percent-encoded). */
  rawPath: string;
  query: URLSearchParams;
  contentType: string | null;
  /** The body as text, or null when it is longer than `limit` bytes. */
  text(limit: number): Promise<string | null>;
}

export interface DispatchDeps {
  server(pluginId: string): PluginServer | null;
  signedIn: boolean;
  canManage: boolean;
  /** Counts the request against the caller's budget. */
  rateLimit(): { allowed: boolean; retryAfterMs: number };
  /** Whether the caller may have another credential checked. */
  credentialBudget(): { allowed: boolean; retryAfterMs: number };
  /** Spends one of the caller's failed credential checks. */
  credentialFailed(): void;
  host(pluginId: string): PluginHost;
  /** Logs and answers a refusal. */
  refused(kind: 'session' | 'manage' | 'rate' | 'credential', retryAfterMs?: number): Response;
}

const NO_STORE = { 'cache-control': 'private, no-store' };

/** The decoded segments; null for an empty segment or one that decodes to a slash, a backslash or a control character. */
export function splitPath(rawPath: string): string[] | null {
  if (rawPath === '') return null;
  const out: string[] = [];
  for (const raw of rawPath.split('/')) {
    let segment: string;
    try {
      segment = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (segment === ''|| /[/\\\u0000-\u001f\u007f]/.test(segment)) return null;
    out.push(segment);
  }
  return out;
}

/** HEAD is answered by GET. */
export function matchRoute(
  routes: readonly PluginRoute[],
  method: string,
  segments: readonly string[]
): { route: PluginRoute; params: Record<string, string> } | null {
  const wanted = method === 'HEAD' ? 'GET' : method;
  for (const route of routes) {
    if (route.method !== wanted) continue;
    const pattern = route.path.split('/');
    if (pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = segments[i];
      else if (pattern[i] !== segments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { route, params };
  }
  return null;
}

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function dispatchPluginRequest(req: DispatchRequest, deps: DispatchDeps): Promise<Response> {
  const budget = deps.rateLimit();
  if (!budget.allowed) return deps.refused('rate', budget.retryAfterMs);

  const server = deps.server(req.pluginId);
  const segments = splitPath(req.rawPath);
  const match = server && segments ? matchRoute(server.routes ?? [], req.method, segments) : null;
  if (!server || !match) return apiError('not_found', {}, { headers: NO_STORE });

  const { route, params } = match;
  if (route.access !== 'public' && !deps.signedIn) return deps.refused('session');
  if (route.access === 'manage' && !deps.canManage) return deps.refused('manage');

  let body: unknown = undefined;
  if (WRITES.has(req.method)) {
    const type = (req.contentType ?? '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') {
      // A DELETE may come without a body; nothing else writes without JSON.
      if (req.method !== 'DELETE' || type !== '') return apiError('json_required', {}, { headers: NO_STORE });
    } else {
      const text = await req.text(MAX_BODY_BYTES);
      if (text === null) return apiError('too_large', {}, { headers: NO_STORE });
      if (text.trim() !== '') {
        try {
          body = JSON.parse(text);
        } catch {
          return apiError('invalid_json', {}, { headers: NO_STORE });
        }
      }
    }
  }

  if (route.checksCredential) {
    const checks = deps.credentialBudget();
    if (!checks.allowed) return deps.refused('credential', checks.retryAfterMs);
  }
  const response = await route.handle({ params, query: req.query, body }, deps.host(req.pluginId));
  if (route.checksCredential && response.status >= 400 && response.status < 500) deps.credentialFailed();
  return response;
}
