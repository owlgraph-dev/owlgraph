// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Handle, HandleServerError, RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
  logEvent,
  logger,
  newId,
  requestLogger,
  errorClass,
  appVersion,
  SLOW_REQUEST_MS,
} from '$lib/platform/logger.server';
import { db } from '$lib/platform/db.server';
import { getSessionUser, hashToken } from '$lib/features/auth/server';
import { RateLimiter } from '$lib/platform/rateLimit';
import { apiError, type ApiErrorCode } from '$lib/platform/apiErrors';
import { secretKeySummary } from '$lib/platform/secretBox.server';
import { allowSelfFraming, applyStylePolicy, generateNonce, CSP_REPORT_PATH, STYLE_SRC_PHASE } from '$lib/platform/csp';
import { PUBLIC_ROUTES } from '$lib/shell/publicRoutes';
import { styleRouteKind } from '$lib/platform/cspRoutes';
import { refreshNamespaceCache } from '$lib/features/namespaces/server';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { getTextDirection } from '$lib/paraglide/runtime';
import { currentSiteLocaleConfig, loadSiteLocaleConfig } from '$lib/platform/i18n/siteLocales.server';
import { resolveUiLocale, UI_LOCALE_COOKIE } from '$lib/platform/i18n/negotiate';
import { COLOR_PREF_COOKIE, resolveColorPref } from '$lib/design-system/theme/preference';

// Warms the [namespace] param matcher's registry at startup, unawaited so a
// slow database doesn't block boot: a namespaced URL in the first instant may
// get a self-healing 404, the risk the browser's copy runs too (hooks.client.ts).
refreshNamespaceCache().catch((err) =>
  logEvent(logger, 'error.unhandled', {
    errorClass: errorClass(err),
    message: 'Failed to warm the namespace cache',
    stack: err instanceof Error ? err.stack : undefined,
  })
);

// The site's languages (docs/architecture/languages.md), warmed the same way; until the read
// lands, every catalogue is enabled and English is the default.
loadSiteLocaleConfig().catch((err) =>
  logEvent(logger, 'error.unhandled', {
    errorClass: errorClass(err),
    message: 'Failed to load the site languages',
    stack: err instanceof Error ? err.stack : undefined,
  })
);

// Values only where they aren't secret: DATABASE_URL embeds APP_DB_PASSWORD,
// so it is reported as set or unset (docs/architecture/logging.md, "Lifecycle").
function configSummary(): Record<string, string> {
  const show = (name: string) => process.env[name] || '(unset)';
  return {
    ORIGIN: show('ORIGIN'),
    BODY_SIZE_LIMIT: show('BODY_SIZE_LIMIT'),
    ADDRESS_HEADER: show('ADDRESS_HEADER'),
    XFF_DEPTH: show('XFF_DEPTH'),
    ENABLE_GRAPHIQL: show('ENABLE_GRAPHIQL'),
    ENABLE_DESIGN_PLAYGROUND: show('ENABLE_DESIGN_PLAYGROUND'),
    // Test tooling only (platform/upstream.server.ts): set in a deployment, a finding.
    INTEGRATIONS_ALLOW_HTTP_LOOPBACK: show('INTEGRATIONS_ALLOW_HTTP_LOOPBACK'),
    DATABASE_URL: process.env.DATABASE_URL ? '(set)' : '(unset)',
    // A secret: whether it is there and fit, never a character of it.
    APP_SECRET_KEY: secretKeySummary(),
  };
}

logEvent(logger, 'app.start', {
  version: appVersion(),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  config: configSummary(),
});

// adapter-node handles graceful shutdown; this only logs the signal. Never
// process.exit here: it would cut the requests adapter-node is draining.
const startedAt = Date.now();
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => logEvent(logger, 'app.stop', { signal, uptimeMs: Date.now() - startedAt }));
}

// After adapter-node has drained and closed its server, the database pool
// still holds the process open (postgres.js keeps connections for their
// lifetime). The agents' server and the scripts end their own pools.
process.once('sveltekit:shutdown', () => void db.end({ timeout: 5 }));

// Fixed-window and in memory, so per process. Login is limited per IP and per
// IP and email, so one account can't be credential-stuffed under the IP limit.
const loginIpLimiter = new RateLimiter(20, 60_000);
const loginEmailLimiter = new RateLimiter(5, 60_000);
const queryLimiter = new RateLimiter(60, 60_000);

async function tooManyRequests(event: RequestEvent, limiter: string, retryAfterMs: number): Promise<Response> {
  logEvent(event.locals.log, 'auth.rate_limited', { limiter, retryAfterMs });
  return apiError('rate_limited', {}, { headers: { 'retry-after': String(Math.ceil(retryAfterMs / 1000)) }, locale: await anonymousLocale(event) });
}

// Before the session is read: the language its cookie or the browser asks for.
async function anonymousLocale(event: RequestEvent): Promise<string> {
  return resolveUiLocale({ cookie: event.cookies.get(UI_LOCALE_COOKIE), acceptLanguage: event.request.headers.get('accept-language') }, await currentSiteLocaleConfig());
}

// The API routes that answer in a body of their own: GraphQL's `errors`, the
// probe's status, the CSP report's empty answer.
const OWN_BODY_ROUTES = new Set(['/api/graphql', '/api/health', '/api/csp-report']);

const CODE_OF_STATUS: Readonly<Record<number, ApiErrorCode>> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  413: 'too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
};

/**
 * What SvelteKit answers itself under /api/ (docs/architecture/routing.md, "Errors") — a
 * thrown error(), an unmatched route, a method without a handler, an
 * unexpected error — in the API's one error body. A route's own answer stands:
 * the error body already, or a byte route's sentence.
 */
async function inApiShape(event: RequestEvent, response: Response): Promise<Response> {
  if (response.status < 400 || !event.url.pathname.startsWith('/api/') || OWN_BODY_ROUTES.has(event.route.id ?? '')) return response;
  let id: string | undefined;
  if ((response.headers.get('content-type') ?? '').includes('application/json')) {
    const body = (await response.clone().json().catch(() => null)) as { error?: unknown; message?: unknown; id?: unknown } | null;
    if (!body || body.error !== undefined || typeof body.message !== 'string') return response;
    id = typeof body.id === 'string' ? body.id : undefined;
  } else if (event.route.id !== null && response.status !== 405) {
    return response;
  }
  const code = response.status >= 500 ? 'internal' : (CODE_OF_STATUS[response.status] ?? 'invalid_request');
  const shaped = apiError(code, code === 'internal' && id ? { id } : {});
  for (const name of ['allow', 'retry-after', 'cache-control']) {
    const value = response.headers.get(name);
    if (value) shaped.headers.set(name, value);
  }
  return new Response(shaped.body, { status: response.status, headers: shaped.headers });
}

// The request log wraps the whole handler: a rate-limited or bounced request
// never reaches resolve() and belongs in the log. A null route id is an asset.
export const handle: Handle = async ({ event, resolve }) => {
  const started = performance.now();
  event.locals.reqId = newId();
  event.locals.log = requestLogger(event.locals.reqId, event.route.id, null);
  // An escaping exception reaches handleError, which logs its cause.
  let status = 500;
  try {
    const response = await serve(event, resolve);
    status = response.status;
    return response;
  } finally {
    if (event.route.id) {
      const durationMs = Math.round(performance.now() - started);
      const fields = { method: event.request.method, status, durationMs };
      logEvent(event.locals.log, 'http.request', fields);
      if (durationMs >= SLOW_REQUEST_MS) logEvent(event.locals.log, 'perf.slow_request', fields);
    }
  }
};

const serve = async (event: RequestEvent, resolve: Parameters<Handle>[0]['resolve']): Promise<Response> => {
  // Resolved only on the rate-limited routes: behind the proxy adapter-node
  // throws without the header, which the loopback healthcheck doesn't send.
  const ip = () => event.getClientAddress();

  if (event.route.id === '/login' && event.request.method === 'POST') {
    // clone(): the page action reads this body too.
    const email = await event.request
      .clone()
      .formData()
      .then((fd) => String(fd.get('email') ?? '').trim().toLowerCase())
      .catch(() => '');
    const ipCheck = loginIpLimiter.check(ip());
    const emailCheck = loginEmailLimiter.check(`${ip()}:${email}`);
    if (!ipCheck.allowed) return tooManyRequests(event, 'login-ip', ipCheck.retryAfterMs);
    if (!emailCheck.allowed) return tooManyRequests(event, 'login-email', emailCheck.retryAfterMs);
  }

  if (event.route.id === '/api/graphql') {
    const check = queryLimiter.check(ip());
    if (!check.allowed) return tooManyRequests(event, 'graphql-ip', check.retryAfterMs);
  }

  const sessionToken = event.cookies.get('session');
  event.locals.user = await getSessionUser(sessionToken, event.locals.log);
  // sessions.id, which a connect in progress is bound to
  // (features/pluginHost/connections.server.ts).
  event.locals.sessionId = event.locals.user && sessionToken ? hashToken(sessionToken) : null;
  // Rebound now the viewer is known; the rate-limit lines above stay anonymous.
  event.locals.log = requestLogger(event.locals.reqId, event.route.id, event.locals.user?.id ?? null);
  // Every <style> this response renders carries it (platform/styleNonce.ts).
  event.locals.styleNonce = generateNonce();
  // A device cookie, rendered on <html> so the page paints in its scheme from
  // the first byte (docs/architecture/theming.md).
  event.locals.colorPref = resolveColorPref(event.cookies.get(COLOR_PREF_COOKIE));

  // The coarse sign-in gate (PUBLIC_ROUTES, src/lib/shell/publicRoutes.ts);
  // role checks are can() in each handler. A static asset has no route id, so
  // it is never redirected.
  const needsAuth = !!event.route.id && !PUBLIC_ROUTES.has(event.route.id);
  if (needsAuth && !event.locals.user) {
    logEvent(event.locals.log, 'authz.denied', {
      action: 'session:required',
      resourceType: 'route',
      resourceId: event.route.id ?? undefined,
      via: event.url.pathname.startsWith('/api/') ? 'api' : 'route',
    });
    if (event.url.pathname.startsWith('/api/')) return apiError('unauthorized', {}, { locale: await anonymousLocale(event) });
    const redirectTo = encodeURIComponent(event.url.pathname + event.url.search);
    return new Response(null, { status: 303, headers: { location: `/login?redirect=${redirectTo}` } });
  }

  // The interface language (docs/architecture/languages.md), decided here because Paraglide
  // knows neither the account nor the enabled languages: it gets a synthetic
  // request carrying only the decision. SSR fills app.html's <html> attributes,
  // which the browser reads its language back from (hooks.client.ts).
  const uiLocale = resolveUiLocale(
    {
      profile: event.locals.user?.locale,
      cookie: event.cookies.get(UI_LOCALE_COOKIE),
      acceptLanguage: event.request.headers.get('accept-language'),
    },
    await currentSiteLocaleConfig()
  );
  const localeRequest = new Request(event.url, { headers: { cookie: `PARAGLIDE_LOCALE=${uiLocale}` } });
  return paraglideMiddleware(localeRequest, async ({ locale }) => {
    event.locals.locale = locale;
    const response = await inApiShape(
      event,
      await resolve(event, {
        transformPageChunk: ({ html }) =>
          html
            .replace('%lang%', locale)
            .replace('%dir%', getTextDirection(locale))
            .replace('%color-pref%', event.locals.colorPref),
      })
    );
    const styleRoute = styleRouteKind(event.route.id);
    applyStyleSrc(response.headers, styleRoute, event.locals.styleNonce);
    response.headers.set('x-content-type-options', 'nosniff');
    // Only the Mermaid render frame may be framed, and only by this origin
    // (its CSP says frame-ancestors 'self'; this is the legacy header's echo).
    response.headers.set('x-frame-options', styleRoute === 'frame' ? 'SAMEORIGIN' : 'DENY');
    // A handler's stricter policy stands (a document's content redirect sends
    // none: documents/serve.server.ts).
    if (!response.headers.has('referrer-policy')) response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    // A signed-in viewer's response is theirs as of now: no copy for Back after
    // sign-out or a change of access (docs/architecture/authorization.md). A response's own
    // policy stands (a public image stays cacheable).
    if (event.locals.user && !response.headers.has('cache-control')) response.headers.set('cache-control', 'private, no-store');
    return response;
  });
};

/**
 * The one error path (docs/architecture/logging.md, "Errors"): unexpected errors and
 * unmatched routes; an expected error(...) shows in http.request's status.
 * +error.svelte shows the id, so the log line can be found.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
  const log = event.locals?.log ?? logger;
  const id = event.locals?.reqId ?? newId();

  // An expected outcome is never `error`, or the error log stops being actionable.
  if (status < 500) {
    logEvent(log, 'error.expected', { status, errorClass: errorClass(error) }, { level: status === 404 ? 'info' : 'warn' });
    return { message, id };
  }

  logEvent(log, 'error.unhandled', {
    errorClass: errorClass(error),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  // Generic: the real message went to the log, under this id.
  return { message: 'An unexpected error occurred.', id };
};

// The CSP's style half per route (platform/csp.ts, cspRoutes.ts), over kit.csp's
// base: a nonce on the reader's routes, 'unsafe-inline' on the authenticated
// tools. Only an HTML page is rewritten: served bytes carry a sandboxing policy
// of their own. In dev SvelteKit has put 'unsafe-inline' in, which a nonce
// beside it would switch off; only the render frame's framing is added there.
function applyStyleSrc(headers: Headers, kind: ReturnType<typeof styleRouteKind>, nonce: string) {
  const base = headers.get('content-security-policy');
  if (!base || !(headers.get('content-type') ?? '').startsWith('text/html')) return;
  if (dev) {
    if (kind === 'frame') headers.set('content-security-policy', allowSelfFraming(base));
    return;
  }
  const { csp, reportOnly } = applyStylePolicy(base, { kind, nonce, phase: STYLE_SRC_PHASE, reportUri: CSP_REPORT_PATH });
  headers.set('content-security-policy', csp);
  if (reportOnly) headers.set('content-security-policy-report-only', reportOnly);
  else headers.delete('content-security-policy-report-only');
}
