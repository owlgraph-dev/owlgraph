// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The MCP server (docs/architecture/mcp.md): Streamable HTTP, a fresh transport per request.
// A bearer token resolves to its user, whose role and node access gate every
// tool through ./registry.ts, as in the app. Each feature's mcp.server.ts
// contributes its tools, on the same server modules the app runs.
import 'dotenv/config';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getUserByToken, type SessionUser } from '../lib/features/auth/server';
import { RateLimiter } from '../lib/platform/rateLimit';
import { secretKeySummary } from '../lib/platform/secretBox.server';
import { sourceInfo } from '../lib/platform/source.server';
import {
  logEvent,
  logger,
  markProcess,
  newId,
  errorClass,
  appVersion,
  type Logger,
} from '../lib/platform/logger.server';
import { paraglideMiddleware } from '../lib/paraglide/server';
import { loadSiteLocaleConfig } from '../lib/platform/i18n/siteLocales.server';
import { resolveUiLocale } from '../lib/platform/i18n/negotiate';
import { createToolRegistry } from './registry';
import { registerPageTools } from '../lib/features/pages/mcp.server';
import { registerGraphTools } from '../lib/features/graph/mcp.server';
import { registerSemanticTools } from '../lib/features/semantic/mcp.server';
import { registerSearchTools } from '../lib/features/search/mcp.server';
import { registerDocumentTools } from '../lib/features/documents/mcp.server';
import { registerCollectionTools } from '../lib/features/collections/mcp.server';
import { registerQueryTools } from '../lib/features/query/mcp.server';
import { registerSiteTools } from '../lib/features/site/mcp.server';
import { apiErrorBody, type ApiErrorCode } from '$lib/platform/apiErrors';

// The root logger reads this label per call, so import order doesn't matter.
markProcess('mcp');

export function buildServer(user: SessionUser, log: Logger = logger) {
  // An agent's client is a network user too (AGPL-3.0 §13): the description
  // offers the source of the version it talks to (platform/source.server.ts).
  const source = sourceInfo();
  const server = new McpServer({
    name: 'owlgraph',
    version: appVersion(),
    websiteUrl: source.url,
    description: `owlgraph knowledge graph — free software under the GNU AGPL 3.0. Source code: ${source.url} (revision ${source.revision}).`,
  });
  const registry = createToolRegistry(server, user, log);
  registerPageTools(registry);
  registerGraphTools(registry);
  registerSemanticTools(registry);
  registerSearchTools(registry);
  registerDocumentTools(registry);
  registerCollectionTools(registry);
  registerQueryTools(registry);
  registerSiteTools(registry);
  return server;
}

// Exported for the HTTP tests (src/mcp/mcp.http.test.ts).
export const app = express();
app.disable('x-powered-by');
// Behind the proxy every caller would share its IP and one pre-auth bucket.
// Exactly XFF_DEPTH hops, so a client can't choose its address by sending the header.
if (process.env.ADDRESS_HEADER) app.set('trust proxy', Number(process.env.XFF_DEPTH ?? 1));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Pre-auth, per IP, bounds the lookups garbage tokens cost; then per user.
const preAuthLimiter = new RateLimiter(30, 60_000);
const userLimiter = new RateLimiter(60, 60_000);

// The app's error body (docs/architecture/routing.md, "Errors"), in the language the request asks for.
function refuse(res: express.Response, code: ApiErrorCode, locale: string, details: Record<string, unknown> = {}): void {
  const { status, body } = apiErrorBody(code, details, locale);
  res.status(status).json(body);
}

// Before the token is read: the language the agent's client asks for.
async function anonymousLocale(req: express.Request): Promise<string> {
  return resolveUiLocale({ acceptLanguage: req.header('accept-language') }, await loadSiteLocaleConfig());
}

app.post('/mcp', async (req, res) => {
  const reqId = newId();
  let log = logger.child({ reqId, userId: 'anon' });

  const preAuthCheck = preAuthLimiter.check(req.ip ?? 'unknown');
  if (!preAuthCheck.allowed) {
    logEvent(log, 'auth.rate_limited', { limiter: 'mcp-preauth', retryAfterMs: preAuthCheck.retryAfterMs });
    res.setHeader('retry-after', String(Math.ceil(preAuthCheck.retryAfterMs / 1000)));
    refuse(res, 'rate_limited', await anonymousLocale(req));
    return;
  }

  const header = req.header('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const user = token ? await getUserByToken(token, log) : null;
  if (!user) {
    // Not even a prefix of the token is logged: a rejected one identifies nothing.
    logEvent(log, 'authz.denied', { action: 'token:required', resourceType: 'route', via: 'mcp' });
    res.setHeader('WWW-Authenticate', 'Bearer');
    refuse(res, 'token_required', await anonymousLocale(req));
    return;
  }
  log = logger.child({ reqId, userId: user.id });

  const userCheck = userLimiter.check(user.id);
  if (!userCheck.allowed) {
    logEvent(log, 'auth.rate_limited', { limiter: 'mcp-user', retryAfterMs: userCheck.retryAfterMs });
    res.setHeader('retry-after', String(Math.ceil(userCheck.retryAfterMs / 1000)));
    refuse(res, 'rate_limited', resolveUiLocale({ profile: user.locale, acceptLanguage: req.header('accept-language') }, await loadSiteLocaleConfig()));
    return;
  }

  try {
    // The tools run in the interface language, resolved as in the app but
    // without a cookie (docs/architecture/languages.md). The site's languages are read per
    // request: no save in this process would refresh a cache.
    const locale = resolveUiLocale(
      { profile: user.locale, acceptLanguage: req.header('accept-language') },
      await loadSiteLocaleConfig()
    );
    const localeRequest = new Request(new URL(req.originalUrl, 'http://mcp.local'), {
      headers: { cookie: `PARAGLIDE_LOCALE=${locale}` },
    });
    await paraglideMiddleware(localeRequest, async () => {
      const server = buildServer(user, log);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return new Response(null);
    });
  } catch (err) {
    logEvent(log, 'error.unhandled', {
      errorClass: errorClass(err),
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    if (!res.headersSent) refuse(res, 'internal', resolveUiLocale({ profile: user.locale, acceptLanguage: req.header('accept-language') }, await loadSiteLocaleConfig()), { id: reqId });
  }
});

const port = Number(process.env.MCP_PORT ?? 3030);
// Tests drive the server in-process.
if (process.env.MCP_DISABLE_LISTEN !== '1') {
  app.listen(port, () =>
    logEvent(logger, 'app.start', {
      version: appVersion(),
      nodeEnv: process.env.NODE_ENV ?? 'development',
      config: {
        MCP_PORT: String(port),
        ADDRESS_HEADER: process.env.ADDRESS_HEADER || '(unset)',
        XFF_DEPTH: process.env.XFF_DEPTH || '(unset)',
        // Never summarized — it embeds APP_DB_PASSWORD.
        DATABASE_URL: process.env.DATABASE_URL ? '(set)' : '(unset)',
        // A secret: whether it is there and fit, never a character of it.
        APP_SECRET_KEY: secretKeySummary(),
        // Test tooling only (platform/upstream.server.ts): set in a deployment, a finding.
        INTEGRATIONS_ALLOW_HTTP_LOOPBACK: process.env.INTEGRATIONS_ALLOW_HTTP_LOOPBACK || '(unset)',
      },
    })
  );
  const startedAt = Date.now();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      logEvent(logger, 'app.stop', { signal, uptimeMs: Date.now() - startedAt });
      process.exit(0);
    });
  }
}
