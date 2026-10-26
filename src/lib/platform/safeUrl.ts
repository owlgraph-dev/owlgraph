// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The one way a URL may reach a log line (docs/architecture/logging.md, "URLs in logs"): a
// /share/<token> path is the whole grant, and a query carries search terms.
// Default-deny: a segment not in ROUTE_SEGMENTS becomes '[id]', so a missing
// route loses detail, never leaks. Where `event.route.id` is in hand, log that.

/** A relative URL resolves against this, so `url.origin === SENTINEL` means "a path in this app". */
const SENTINEL = 'http://relative.invalid';

const MAX_LENGTH = 200;

/** Not URLs: the CSP spec's keywords a report's `blocked-uri` may hold. */
const CSP_KEYWORDS: ReadonlySet<string> = new Set([
  'inline',
  'eval',
  'self',
  'data',
  'blob',
  'filesystem',
  'about',
  'wasm-eval',
  'unsafe-eval',
  'trusted-types-policy',
  'trusted-types-sink',
]);

/** Generated chunk names, kept verbatim: no authored value can appear there. */
const BUILD_PREFIX = '/_app/';

/** Every literal path segment in src/routes, pinned by safeUrl.test.ts. */
export const ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
  // top level
  '-',
  'api',
  'dev',
  'graph',
  'login',
  'logout',
  'search',
  'settings',
  'share',
  // /[[namespace]]/[slug]/…
  'edit',
  // /-/… (the app's own pages)
  'about',
  'license',
  // /api/… (and /settings/connections)
  'collections',
  'connections',
  'csp-report',
  'documents',
  'embed',
  'graphql',
  'health',
  'integrations',
  'locale',
  'media',
  'namespaces',
  'node-search',
  'pages',
  'plugins',
  'relationship-types',
  'search-count',
  'styles',
  // /api/collections/[id]/…, /api/documents/[id]/…, /api/pages/[id]/… and /share/[id]/…
  'apply-picks',
  'content',
  'heartbeat',
  'lock',
  'members',
  'release',
  'render-blocks',
  'share-links',
  'source',
  'versions',
  // /api/connections/[plugin]/…
  'check',
  'flow',
  'poll',
  // /api/embed/…, /api/media/…, /api/namespaces/…, /api/styles/…
  'avatar',
  'branding',
  'fonts',
  'logo',
  'mermaid',
  'site',
  'slugs',
  // /dev/…
  'design-system',
  // /settings/…
  'api-tokens',
  'classes',
  'color-scheme',
  'footer',
  'groups',
  'home',
  'languages',
  'navigation',
  'page-layouts',
  'profile',
  'properties',
  'relationships',
  'schema',
  'users',
]);

/** A pathname's route shape: `/share/hA7c…` becomes `/share/[id]`. */
export function routePattern(pathname: string): string {
  const path = pathname.split(/[?#]/)[0];
  if (path.startsWith(BUILD_PREFIX)) return path.slice(0, MAX_LENGTH);
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  const out = '/' + segments.map((s) => (ROUTE_SEGMENTS.has(s) ? s : '[id]')).join('/');
  return out.slice(0, MAX_LENGTH);
}

/**
 * A URL reduced to what may be logged: a path, or a URL on `opts.origin`, as
 * its route pattern; another http(s) URL as its origin (no path, no userinfo);
 * another scheme as the scheme; anything unparsable as a fixed marker. Without
 * `opts.origin` the app's own absolute URLs count as external.
 */
export function safeUrl(value: unknown, opts: { origin?: string } = {}): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  if (CSP_KEYWORDS.has(raw.toLowerCase())) return raw.toLowerCase();

  let url: URL;
  try {
    url = new URL(raw, SENTINEL);
  } catch {
    return '(unparsable)';
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return `${url.protocol}…`;
  if (url.origin === SENTINEL || (opts.origin && url.origin === opts.origin)) return routePattern(url.pathname);
  return `${url.origin}/…`.slice(0, MAX_LENGTH);
}
